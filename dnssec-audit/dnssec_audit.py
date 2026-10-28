#!/usr/bin/env python3
"""Read-only PN-15539 DNSSEC audit. See README.md and --help for scope and limits."""

import argparse
from collections import Counter
from datetime import datetime, timezone
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from typing import Any


STATUSES = ("OK", "FAIL", "WARN", "ERROR", "SKIP")
LIMITATIONS = [
    "Public hosted zones are account-wide; VPC checks cover only the requested regions.",
    "DNS queries use this machine's resolver, or --dns-server, not the audited VPCs.",
    "DS and chain checks reflect DNS caches and the local delv root trust anchor.",
    "KMS metadata is checked, not effective key policies, IAM policies or grants.",
    "No workload DNS tests, alarm checks, key rotation checks or changes are performed.",
]


class AuditError(Exception):
    """A check could not collect reliable evidence."""


def run_command(command: list[str], timeout: int) -> str:
    env = dict(os.environ, AWS_PAGER="", AWS_CLI_AUTO_PROMPT="off")
    try:
        result = subprocess.run(
            command, capture_output=True, text=True, timeout=timeout, env=env,
            encoding="utf-8", errors="replace", check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise AuditError(f"{command[0]} timed out after {timeout}s") from exc
    except OSError as exc:
        raise AuditError(f"Cannot execute {command[0]}: {exc}") from exc
    if result.returncode:
        detail = (result.stderr or result.stdout).strip()
        raise AuditError(f"{command[0]} exited {result.returncode}: {detail}")
    if result.stderr.strip():
        print(f"{command[0]}: {result.stderr.strip()}", file=sys.stderr)
    return result.stdout


def required_list(data: object, key: str) -> list[Any]:
    value = data.get(key) if isinstance(data, dict) else None
    if not isinstance(value, list):
        raise AuditError(f"Response is missing the list {key}")
    return value


def required_object(data: object, key: str) -> dict[str, Any]:
    value = data.get(key) if isinstance(data, dict) else None
    if not isinstance(value, dict):
        raise AuditError(f"Response is missing the object {key}")
    return value


def canonical_name(value: str) -> str:
    if not isinstance(value, str):
        raise AuditError(f"Unsupported DNS name: {value!r}")
    name = value.rstrip(".").lower()
    if (
        not name or len(name) > 253
        or any(not re.fullmatch(r"[a-z0-9_-]{1,63}", label) for label in name.split("."))
    ):
        raise AuditError(f"Unsupported DNS name: {value!r}")
    return name + "."


def canonical_ds(value: str) -> str:
    if not isinstance(value, str):
        raise AuditError(f"Malformed DS record: {value!r}")
    parts = value.split()
    if (
        len(parts) != 4 or not all(part.isdigit() for part in parts[:3])
        or not re.fullmatch(r"[0-9a-fA-F]+", parts[3])
    ):
        raise AuditError(f"Malformed DS record: {value!r}")
    return " ".join([*(str(int(part)) for part in parts[:3]), parts[3].upper()])


class Audit:
    def __init__(self, timeout: int, dns_server: str | None):
        self.timeout = timeout
        self.dns_server = dns_server
        self.findings: list[dict[str, str]] = []
        self.identities: list[dict[str, str]] = []
        self.dig = shutil.which("dig")
        self.delv = shutil.which("delv")
        self.dhcp_cache: dict[tuple[str, str, str], dict[str, Any]] = {}
        self.rule_cache: dict[tuple[str, str, str], dict[str, Any]] = {}

    def add(self, context: dict[str, str], check: str, status: str, detail: str):
        self.findings.append(dict(context, check=check, status=status, detail=detail))

    def aws(self, profile: str, region: str, service: str, operation: str,
            *parameters: str) -> dict[str, Any]:
        # Do not limit pages: the CLI aggregates all pages into the JSON result.
        output = run_command([
            "aws", "--profile", profile, "--region", region, "--output", "json",
            "--no-cli-pager", "--cli-connect-timeout", "10", "--cli-read-timeout", "30",
            service, operation, *parameters,
        ], self.timeout)
        try:
            response = json.loads(output)
        except json.JSONDecodeError as exc:
            raise AuditError(f"{service} {operation} returned invalid JSON: {exc}") from exc
        if not isinstance(response, dict):
            raise AuditError(f"{service} {operation} did not return a JSON object")
        return response

    def dns_records(self, name: str, record_type: str) -> list[list[str]]:
        if not self.dig:
            raise AuditError("dig is not installed")
        server = [f"@{self.dns_server}"] if self.dns_server else []
        output = run_command([
            self.dig, *server, "+time=5", "+tries=1", "+noall", "+comments",
            "+answer", "+nomultiline", "+nosplit", "-q", name, "-t", record_type,
        ], self.timeout)
        status = re.search(r"status:\s*([A-Z]+)", output)
        if not status or status.group(1) != "NOERROR":
            raise AuditError(f"DNS {record_type} lookup failed for {name}: {output.strip()}")
        records = []
        for line in output.splitlines():
            fields = line.split()
            if len(fields) >= 5 and not line.startswith(";"):
                if canonical_name(fields[0]) == name and fields[3].upper() == record_type:
                    records.append(fields[4:])
        return records

    def audit_public_dns(self, context: dict[str, str], name: str,
                         expected_ns: set[str], active_ds: set[str]):
        if not self.dig:
            self.add(context, "public_delegation", "WARN", "dig missing; NS check not performed")
            self.add(context, "parent_ds", "WARN", "dig missing; DS check not performed")
        else:
            try:
                actual_ns = {
                    canonical_name(record[0]) for record in self.dns_records(name, "NS")
                }
                if actual_ns and actual_ns == expected_ns:
                    self.add(context, "public_delegation", "OK", "Public NS match this hosted zone")
                else:
                    self.add(
                        context, "public_delegation", "WARN",
                        f"Public NS {sorted(actual_ns)} differ from assigned NS {sorted(expected_ns)}; "
                        "check unused/duplicate zones, delegation and vanity nameservers",
                    )
            except AuditError as exc:
                self.add(context, "public_delegation", "ERROR", str(exc))
            try:
                published_ds = {
                    canonical_ds(" ".join(record)) for record in self.dns_records(name, "DS")
                }
                matching = published_ds & active_ds
                if matching:
                    self.add(context, "parent_ds", "OK", f"Matches an active KSK: {sorted(matching)}")
                elif not published_ds:
                    self.add(context, "parent_ds", "FAIL", "No DS record published in the parent")
                else:
                    self.add(
                        context, "parent_ds", "FAIL",
                        f"Published DS {sorted(published_ds)} do not match an active KSK "
                        f"{sorted(active_ds)}",
                    )
            except AuditError as exc:
                self.add(context, "parent_ds", "ERROR", str(exc))

        if not self.delv:
            self.add(context, "chain_of_trust", "WARN", "delv missing; chain not validated")
            return
        server = [f"@{self.dns_server}"] if self.dns_server else []
        try:
            output = run_command(
                [self.delv, *server, "+nomultiline", "-q", name, "-t", "SOA"], self.timeout,
            )
            has_soa = any(
                len(fields := line.split()) >= 5
                and not line.startswith(";")
                and fields[0].lower() == name
                and fields[3].upper() == "SOA"
                for line in output.splitlines()
            )
            if re.search(r"^;\s*fully validated\s*$", output, re.MULTILINE) and has_soa:
                self.add(context, "chain_of_trust", "OK", "delv fully validated the zone SOA")
            elif re.search(r"^;\s*unsigned answer\s*$", output, re.MULTILINE) and has_soa:
                self.add(context, "chain_of_trust", "FAIL", "delv returned an unsigned zone SOA")
            else:
                raise AuditError(f"delv did not prove a validated zone SOA: {output.strip()}")
        except AuditError as exc:
            self.add(context, "chain_of_trust", "ERROR", str(exc))

    def audit_kms(self, context: dict[str, str], key: dict[str, Any]):
        arn = key.get("KmsArn")
        parts = arn.split(":", 5) if isinstance(arn, str) else []
        if len(parts) != 6 or parts[2] != "kms" or not parts[3]:
            raise AuditError(f"KSK {key.get('Name')} has an invalid KMS ARN: {arn!r}")
        response = self.aws(
            context["profile"], parts[3], "kms", "describe-key", "--key-id", arn,
        )
        metadata = required_object(response, "KeyMetadata")
        expected = {
            "KeyState": "Enabled", "KeySpec": "ECC_NIST_P256",
            "KeyUsage": "SIGN_VERIFY", "KeyManager": "CUSTOMER",
        }
        issues = [
            f"{field}={metadata.get(field)!r} (expected {value})"
            for field, value in expected.items() if metadata.get(field) != value
        ]
        if parts[3] != "us-east-1":
            issues.append(f"region={parts[3]} (expected us-east-1)")
        self.add(
            context, "kms_key", "FAIL" if issues else "OK",
            f"{key.get('Name')}: {arn}; " + (
                "; ".join(issues) if issues else "enabled customer-managed ECC_NIST_P256 SIGN_VERIFY key"
            ),
        )

    def audit_zone(self, context: dict[str, str], zone: dict[str, Any]):
        name = canonical_name(zone["Name"])
        response = self.aws(
            context["profile"], "us-east-1", "route53", "get-dnssec",
            "--hosted-zone-id", zone["Id"],
        )
        status = required_object(response, "Status")
        state = status.get("ServeSignature")
        if state == "SIGNING":
            verdict = "OK"
        elif state in ("NOT_SIGNING", "INTERNAL_FAILURE"):
            verdict = "FAIL"
        elif state == "DELETING":
            verdict = "WARN"
        else:
            verdict = "ERROR"
        self.add(context, "zone_signing", verdict, f"{state}: {status.get('StatusMessage', '')}")
        keys = required_list(response, "KeySigningKeys")
        active_ds: set[str] = set()
        active_keys = 0
        for key in keys:
            if not isinstance(key, dict):
                raise AuditError("Malformed KSK response")
            key_state = key.get("Status")
            if key_state == "ACTIVE":
                active_keys += 1
                self.add(context, "ksk_status", "OK", f"{key.get('Name')}: ACTIVE")
                try:
                    active_ds.add(canonical_ds(key.get("DSRecord", "")))
                except AuditError as exc:
                    self.add(context, "ksk_ds", "ERROR", str(exc))
                try:
                    self.audit_kms(context, key)
                except AuditError as exc:
                    self.add(context, "kms_key", "ERROR", str(exc))
            else:
                verdict = {
                    "INACTIVE": "SKIP", "DELETING": "WARN",
                    "ACTION_NEEDED": "FAIL", "INTERNAL_FAILURE": "FAIL",
                }.get(key_state, "ERROR")
                self.add(
                    context, "ksk_status", verdict,
                    f"{key.get('Name')}: {key_state}; {key.get('StatusMessage', '')}",
                )
        self.add(
            context, "active_ksk", "OK" if active_keys else "FAIL",
            f"{active_keys} active KSK(s)",
        )
        expected_ns: set[str] = set()
        try:
            details = self.aws(
                context["profile"], "us-east-1", "route53", "get-hosted-zone",
                "--id", zone["Id"],
            )
            delegation = required_object(details, "DelegationSet")
            expected_ns = {
                canonical_name(server) for server in required_list(delegation, "NameServers")
            }
            if not expected_ns:
                raise AuditError("Empty assigned nameserver list")
        except AuditError as exc:
            self.add(context, "assigned_nameservers", "ERROR", str(exc))
        self.audit_public_dns(context, name, expected_ns, active_ds)

    def audit_zones(self, profile: str, account: str):
        context = dict(profile=profile, account=account, region="global", resource="hosted-zones")
        try:
            zones = required_list(self.aws(profile, "us-east-1", "route53", "list-hosted-zones"), "HostedZones")
        except AuditError as exc:
            self.add(context, "zone_inventory", "ERROR", str(exc))
            return
        public_count = 0
        for zone in zones:
            if not isinstance(zone, dict) or not zone.get("Id") or not zone.get("Name"):
                self.add(context, "zone_inventory", "ERROR", f"Malformed hosted zone: {zone!r}")
                continue
            zone_context = dict(context, resource=f"{zone['Name']} ({zone['Id']})")
            try:
                private = required_object(zone, "Config").get("PrivateZone")
                if not isinstance(private, bool):
                    raise AuditError("Hosted zone response is missing PrivateZone")
                if private:
                    self.add(zone_context, "zone_signing", "SKIP", "Private hosted zone: signing not supported")
                    continue
                public_count += 1
                self.audit_zone(zone_context, zone)
            except AuditError as exc:
                self.add(zone_context, "zone_audit", "ERROR", str(exc))
        self.add(
            context, "zone_inventory", "OK" if public_count else "WARN",
            f"{len(zones)} hosted zone(s), {public_count} public; all CLI pages included",
        )

    def audit_dns_path(self, context: dict[str, str], vpc: dict[str, Any]):
        profile, region = context["profile"], context["region"]
        response = self.aws(
            profile, region, "ec2", "describe-vpc-attribute",
            "--vpc-id", vpc["VpcId"], "--attribute", "enableDnsSupport",
        )
        enabled = required_object(response, "EnableDnsSupport").get("Value")
        if not isinstance(enabled, bool):
            raise AuditError("EnableDnsSupport.Value is missing")
        self.add(
            context, "amazon_dns_support", "OK" if enabled else "WARN",
            f"enableDnsSupport={enabled}; this does not prove which resolver workloads use",
        )
        dhcp_id = vpc.get("DhcpOptionsId")
        if not dhcp_id:
            raise AuditError("VPC response is missing DhcpOptionsId")
        cache_key = (profile, region, dhcp_id)
        if cache_key not in self.dhcp_cache:
            self.dhcp_cache[cache_key] = self.aws(
                profile, region, "ec2", "describe-dhcp-options", "--dhcp-options-ids", dhcp_id,
            )
        options = required_list(self.dhcp_cache[cache_key], "DhcpOptions")
        servers = []
        for option in options:
            for config in required_list(option, "DhcpConfigurations"):
                if not isinstance(config, dict):
                    raise AuditError("Malformed DHCP configuration")
                if config.get("Key") == "domain-name-servers":
                    for value in required_list(config, "Values"):
                        if not isinstance(value, dict) or not isinstance(value.get("Value"), str):
                            raise AuditError("Malformed DHCP server value")
                        servers.append(value["Value"])
        if not servers:
            raise AuditError("DHCP options contain no domain-name-servers")
        self.add(
            context, "dhcp_dns_servers", "OK" if servers == ["AmazonProvidedDNS"] else "WARN",
            f"DHCP DNS servers: {servers}; custom DNS requires downstream validation checks",
        )

    def audit_forwarding(self, context: dict[str, str], vpc_id: str):
        profile, region = context["profile"], context["region"]
        response = self.aws(
            profile, region, "route53resolver", "list-resolver-rule-associations",
            "--filters", f"Name=VPCId,Values={vpc_id}",
        )
        associations = required_list(response, "ResolverRuleAssociations")
        forwarding = []
        for association in associations:
            if not isinstance(association, dict):
                raise AuditError("Malformed resolver association")
            rule_id = association.get("ResolverRuleId")
            if not rule_id:
                raise AuditError("Resolver association is missing ResolverRuleId")
            if association.get("Status") != "COMPLETE":
                self.add(
                    context, "resolver_association", "WARN",
                    f"{rule_id}: {association.get('Status')}; {association.get('StatusMessage', '')}",
                )
            cache_key = (profile, region, rule_id)
            if cache_key not in self.rule_cache:
                self.rule_cache[cache_key] = self.aws(
                    profile, region, "route53resolver", "get-resolver-rule",
                    "--resolver-rule-id", rule_id,
                )
            rule = required_object(self.rule_cache[cache_key], "ResolverRule")
            rule_type = rule.get("RuleType")
            if rule_type in ("FORWARD", "DELEGATE"):
                forwarding.append(f"{rule_id}: {rule.get('DomainName')} ({rule_type})")
            elif rule_type not in ("SYSTEM", "RECURSIVE"):
                raise AuditError(f"Unknown resolver rule type: {rule_type!r}")
        self.add(
            context, "resolver_forwarding", "WARN" if forwarding else "OK",
            "Check DNSSEC on downstream recursive resolvers: " + "; ".join(forwarding)
            if forwarding else "No forwarding/delegation rule associations found",
        )

    def audit_vpcs(self, profile: str, account: str, region: str):
        context = dict(profile=profile, account=account, region=region, resource="vpcs")
        try:
            vpcs = required_list(self.aws(profile, region, "ec2", "describe-vpcs"), "Vpcs")
        except AuditError as exc:
            self.add(context, "vpc_inventory", "ERROR", str(exc))
            return
        self.add(
            context, "vpc_inventory", "OK" if vpcs else "WARN",
            f"{len(vpcs)} VPC(s); all CLI pages included",
        )
        for vpc in vpcs:
            if not isinstance(vpc, dict) or not vpc.get("VpcId"):
                self.add(context, "vpc_inventory", "ERROR", f"Malformed VPC: {vpc!r}")
                continue
            vpc_context = dict(context, resource=vpc["VpcId"])
            try:
                response = self.aws(
                    profile, region, "route53resolver", "get-resolver-dnssec-config",
                    "--resource-id", vpc["VpcId"],
                )
                state = required_object(response, "ResolverDNSSECConfig").get("ValidationStatus")
                verdict = {
                    "ENABLED": "OK", "DISABLED": "FAIL",
                    "ENABLING": "WARN", "DISABLING": "WARN",
                }.get(state, "ERROR")
                self.add(vpc_context, "vpc_validation", verdict, f"ValidationStatus={state}")
            except AuditError as exc:
                self.add(vpc_context, "vpc_validation", "ERROR", str(exc))
            try:
                self.audit_dns_path(vpc_context, vpc)
            except AuditError as exc:
                self.add(vpc_context, "vpc_dns_path", "ERROR", str(exc))
            try:
                self.audit_forwarding(vpc_context, vpc["VpcId"])
            except AuditError as exc:
                self.add(vpc_context, "resolver_forwarding", "ERROR", str(exc))

    def scan(self, profiles: list[str], regions: list[str]):
        for profile in profiles:
            print(f"Scanning AWS profile {profile}...", file=sys.stderr)
            context = dict(profile=profile, account="unknown", region=regions[0], resource="account")
            try:
                identity = self.aws(profile, regions[0], "sts", "get-caller-identity")
                account = identity.get("Account")
                if not isinstance(account, str) or not re.fullmatch(r"\d{12}", account):
                    raise AuditError("STS response is missing a valid Account")
            except AuditError as exc:
                self.add(context, "aws_identity", "ERROR", str(exc))
                continue
            self.identities.append(dict(profile=profile, account=account))
            self.add(dict(context, account=account), "aws_identity", "OK", "STS identity verified")
            self.audit_zones(profile, account)
            for region in regions:
                self.audit_vpcs(profile, account, region)

    def report(self, profiles: list[str], regions: list[str]) -> dict[str, Any]:
        counts = Counter(finding["status"] for finding in self.findings)
        exit_code = 2 if counts["ERROR"] else 1 if counts["FAIL"] else 3 if counts["WARN"] else 0
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "scope": dict(profiles=profiles, vpc_regions=regions, dns_server=self.dns_server or "system"),
            "identities": self.identities,
            "summary": {status: counts[status] for status in STATUSES},
            "exit_code": exit_code,
            "limitations": LIMITATIONS,
            "findings": self.findings,
        }


def positive_int(value: str) -> int:
    try:
        number = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be a positive integer") from exc
    if number <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return number


def dns_server_address(value: str) -> str:
    try:
        return str(ipaddress.ip_address(value))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an IPv4 or IPv6 address") from exc


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Read-only DNSSEC configuration audit for explicit AWS profiles and VPC regions.",
        epilog="Exit codes: 0=all automated checks OK, 1=FAIL, 2=ERROR, 3=WARN/incomplete. "
               "No AWS login or configuration changes are performed.",
    )
    parser.add_argument("--profiles", nargs="+", required=True, help="AWS CLI profiles to audit")
    parser.add_argument("--regions", nargs="+", required=True, help="VPC regions to audit; zones are global")
    parser.add_argument("--dns-server", type=dns_server_address, help="DNS server IP; default: system resolver")
    parser.add_argument("--timeout", type=positive_int, default=90, help="Per-command timeout in seconds (default: 90)")
    parser.add_argument("--output", type=Path, help="New JSON report path; default: output/dnssec-audit-<UTC>.json")
    args = parser.parse_args(argv)
    if not shutil.which("aws"):
        parser.error("AWS CLI is not installed or not on PATH")
    profiles = list(dict.fromkeys(args.profiles))
    regions = list(dict.fromkeys(args.regions))
    for region in regions:
        if not re.fullmatch(r"[a-z]{2}(?:-[a-z]+)+-\d+", region):
            parser.error(f"Invalid AWS region: {region!r}")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output = args.output or Path(__file__).resolve().parent / "output" / f"dnssec-audit-{timestamp}.json"
    if output.exists():
        parser.error(f"Refusing to overwrite an existing report: {output}")
    audit = Audit(args.timeout, args.dns_server)
    audit.scan(profiles, regions)
    report = audit.report(profiles, regions)
    for finding in audit.findings:
        print(
            f"[{finding['status']}] {finding['profile']} {finding['region']} "
            f"{finding['resource']} | {finding['check']} | {finding['detail']}"
        )
    print("\n" + " ".join(f"{status}={count}" for status, count in report["summary"].items()))
    try:
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("x", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2)
            handle.write("\n")
    except OSError as exc:
        print(f"ERROR: Cannot write JSON report {output}: {exc}", file=sys.stderr)
        return 2
    print(f"JSON report: {output.resolve()}")
    print("Configuration audit only: see report limitations for remaining manual checks.")
    return report["exit_code"]


if __name__ == "__main__":
    sys.exit(main())
