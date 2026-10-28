import contextlib
from copy import deepcopy
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "dnssec_audit.py"
SPEC = importlib.util.spec_from_file_location("dnssec_audit", SCRIPT)
audit_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit_module)

DS = "12345 13 2 " + "A" * 64
NAME = "example.test."
SOA = f"{NAME} 300 IN SOA ns1.example.test. hostmaster.example.test. 1 60 60 60 60\n"
READ_OPERATIONS = {
    ("sts", "get-caller-identity"),
    ("route53", "list-hosted-zones"),
    ("route53", "get-dnssec"),
    ("route53", "get-hosted-zone"),
    ("kms", "describe-key"),
    ("ec2", "describe-vpcs"),
    ("ec2", "describe-vpc-attribute"),
    ("ec2", "describe-dhcp-options"),
    ("route53resolver", "get-resolver-dnssec-config"),
    ("route53resolver", "list-resolver-rule-associations"),
    ("route53resolver", "get-resolver-rule"),
}


def fixture_responses():
    return {
        ("sts", "get-caller-identity"): {"Account": "123456789012"},
        ("route53", "list-hosted-zones"): {
            "HostedZones": [
                {"Id": "/hostedzone/ZPUBLIC", "Name": NAME, "Config": {"PrivateZone": False}},
                {"Id": "/hostedzone/ZPRIVATE", "Name": "private.test.", "Config": {"PrivateZone": True}},
            ],
        },
        ("route53", "get-dnssec"): {
            "Status": {"ServeSignature": "SIGNING"},
            "KeySigningKeys": [{
                "Name": "active", "Status": "ACTIVE", "DSRecord": DS,
                "KmsArn": "arn:aws:kms:us-east-1:123456789012:key/example",
            }],
        },
        ("route53", "get-hosted-zone"): {
            "DelegationSet": {"NameServers": ["ns1.example.test", "ns2.example.test"]},
        },
        ("kms", "describe-key"): {
            "KeyMetadata": {
                "KeyState": "Enabled", "KeySpec": "ECC_NIST_P256",
                "KeyUsage": "SIGN_VERIFY", "KeyManager": "CUSTOMER",
            },
        },
        ("ec2", "describe-vpcs"): {"Vpcs": [{"VpcId": "vpc-123", "DhcpOptionsId": "dopt-123"}]},
        ("ec2", "describe-vpc-attribute"): {"EnableDnsSupport": {"Value": True}},
        ("ec2", "describe-dhcp-options"): {
            "DhcpOptions": [{
                "DhcpConfigurations": [{
                    "Key": "domain-name-servers", "Values": [{"Value": "AmazonProvidedDNS"}],
                }],
            }],
        },
        ("route53resolver", "get-resolver-dnssec-config"): {
            "ResolverDNSSECConfig": {"ValidationStatus": "ENABLED"},
        },
        ("route53resolver", "list-resolver-rule-associations"): {"ResolverRuleAssociations": []},
        ("route53resolver", "get-resolver-rule"): {
            "ResolverRule": {"RuleType": "FORWARD", "DomainName": "external.test."},
        },
    }


class AuditTests(unittest.TestCase):
    def setUp(self):
        self.responses = fixture_responses()
        self.calls = []
        self.dns_status = "NOERROR"
        self.published_ds = [DS]
        self.nameservers = ["ns1.example.test.", "ns2.example.test."]
        self.delv_output = "; fully validated\n" + SOA
        self.delv_error = None
        self.failed_profile = None
        self.which = patch.object(audit_module.shutil, "which", side_effect=lambda name: name)
        self.runner = patch.object(audit_module, "run_command", side_effect=self.fake_command)
        self.which.start()
        self.runner.start()
        self.addCleanup(self.which.stop)
        self.addCleanup(self.runner.stop)
        self.stderr = io.StringIO()
        self.redirect = contextlib.redirect_stderr(self.stderr)
        self.redirect.__enter__()
        self.addCleanup(self.redirect.__exit__, None, None, None)

    def fake_command(self, command, timeout):
        self.calls.append(command)
        if command[0] == "aws":
            service, operation = command[12:14]
            self.assertIn((service, operation), READ_OPERATIONS)
            self.assertNotIn("--no-paginate", command)
            self.assertNotIn("--max-items", command)
            self.assertNotIn("--max-results", command)
            if command[2] == self.failed_profile:
                raise audit_module.AuditError("SSO session expired")
            response = self.responses[(service, operation)]
            if isinstance(response, audit_module.AuditError):
                raise response
            return json.dumps(response)
        if command[0] == "dig":
            record_type = command[command.index("-t") + 1]
            rows = self.nameservers if record_type == "NS" else self.published_ds
            return (
                f";; ->>HEADER<<- opcode: QUERY, status: {self.dns_status}, id: 1\n"
                + "".join(f"{NAME} 300 IN {record_type} {row}\n" for row in rows)
            )
        if command[0] == "delv":
            if self.delv_error:
                raise audit_module.AuditError(self.delv_error)
            return self.delv_output
        self.fail(f"Unexpected executable: {command}")

    def scan(self, profiles=None, regions=None):
        profiles = profiles or ["core"]
        regions = regions or ["eu-south-1"]
        audit = audit_module.Audit(90, None)
        audit.scan(profiles, regions)
        return audit, audit.report(profiles, regions)

    def findings(self, report, check):
        return [row for row in report["findings"] if row["check"] == check]

    def test_complete_compliant_scan_and_read_only_commands(self):
        _, report = self.scan()
        self.assertEqual(report["exit_code"], 0)
        self.assertEqual(report["summary"]["SKIP"], 1)
        self.assertEqual(report["summary"]["ERROR"], 0)
        self.assertEqual(self.findings(report, "parent_ds")[0]["status"], "OK")
        self.assertEqual(self.findings(report, "chain_of_trust")[0]["status"], "OK")
        self.assertEqual(report["identities"], [{"profile": "core", "account": "123456789012"}])

    def test_all_profiles_regions_and_aggregated_resources_are_scanned(self):
        zones = self.responses[("route53", "list-hosted-zones")]["HostedZones"]
        zones.append(dict(deepcopy(zones[0]), Id="/hostedzone/ZSECOND"))
        vpcs = self.responses[("ec2", "describe-vpcs")]["Vpcs"]
        vpcs.append(dict(deepcopy(vpcs[0]), VpcId="vpc-456"))
        _, report = self.scan(["core", "spid"], ["eu-south-1", "eu-central-1"])
        self.assertEqual(report["exit_code"], 0)
        self.assertEqual(len(self.findings(report, "zone_signing")), 6)
        self.assertEqual(len(self.findings(report, "vpc_validation")), 8)
        inventories = [call for call in self.calls if call[0] == "aws" and call[13] == "list-hosted-zones"]
        self.assertEqual(len(inventories), 2)

    def test_signing_disabled_and_no_active_ksk(self):
        self.responses[("route53", "get-dnssec")] = {
            "Status": {"ServeSignature": "NOT_SIGNING"}, "KeySigningKeys": [],
        }
        self.published_ds = []
        self.delv_output = "; unsigned answer\n" + SOA
        _, report = self.scan()
        self.assertEqual(report["exit_code"], 1)
        for check in ("zone_signing", "active_ksk", "parent_ds", "chain_of_trust"):
            self.assertEqual(self.findings(report, check)[0]["status"], "FAIL", check)

    def test_inactive_key_does_not_require_kms_lookup(self):
        keys = self.responses[("route53", "get-dnssec")]["KeySigningKeys"]
        keys.append({"Name": "old", "Status": "INACTIVE"})
        _, report = self.scan()
        self.assertEqual(report["exit_code"], 0)
        self.assertEqual(len(self.findings(report, "kms_key")), 1)
        self.assertEqual(self.findings(report, "ksk_status")[1]["status"], "SKIP")

    def test_ksk_action_needed_is_a_failure(self):
        self.responses[("route53", "get-dnssec")]["KeySigningKeys"].append({
            "Name": "broken", "Status": "ACTION_NEEDED", "StatusMessage": "KMS inaccessible",
        })
        _, report = self.scan()
        self.assertEqual(self.findings(report, "ksk_status")[1]["status"], "FAIL")
        self.assertEqual(report["exit_code"], 1)

    def test_wrong_kms_configuration(self):
        self.responses[("kms", "describe-key")]["KeyMetadata"].update(
            KeyState="PendingDeletion", KeySpec="SYMMETRIC_DEFAULT",
            KeyUsage="ENCRYPT_DECRYPT", KeyManager="AWS",
        )
        key = self.responses[("route53", "get-dnssec")]["KeySigningKeys"][0]
        key["KmsArn"] = key["KmsArn"].replace("us-east-1", "eu-south-1")
        _, report = self.scan()
        row = self.findings(report, "kms_key")[0]
        self.assertEqual(row["status"], "FAIL")
        for field in ("KeyState", "KeySpec", "KeyUsage", "KeyManager", "region="):
            self.assertIn(field, row["detail"])
        kms_call = next(call for call in self.calls if call[0] == "aws" and call[12] == "kms")
        self.assertEqual(kms_call[4], "eu-south-1")

    def test_kms_access_denied_is_not_a_pass_and_scan_continues(self):
        self.responses[("kms", "describe-key")] = audit_module.AuditError("AccessDeniedException")
        _, report = self.scan()
        self.assertEqual(report["exit_code"], 2)
        self.assertEqual(self.findings(report, "kms_key")[0]["status"], "ERROR")
        self.assertEqual(self.findings(report, "vpc_validation")[0]["status"], "OK")

    def test_ds_rollover_accepts_one_matching_active_key(self):
        self.published_ds = ["54321 13 2 " + "B" * 64, DS.lower()]
        _, report = self.scan()
        self.assertEqual(self.findings(report, "parent_ds")[0]["status"], "OK")

    def test_ds_mismatch_is_failure(self):
        self.published_ds = ["54321 13 2 " + "B" * 64]
        _, report = self.scan()
        self.assertEqual(self.findings(report, "parent_ds")[0]["status"], "FAIL")
        self.assertEqual(report["exit_code"], 1)

    def test_public_nameserver_mismatch_needs_manual_review(self):
        self.nameservers = ["other.example.test."]
        _, report = self.scan()
        self.assertEqual(self.findings(report, "public_delegation")[0]["status"], "WARN")
        self.assertEqual(report["exit_code"], 3)

    def test_dns_servfail_is_error_not_absent_ds(self):
        self.dns_status = "SERVFAIL"
        _, report = self.scan()
        self.assertEqual(self.findings(report, "parent_ds")[0]["status"], "ERROR")
        self.assertIn("SERVFAIL", self.findings(report, "parent_ds")[0]["detail"])
        self.assertEqual(report["exit_code"], 2)

    def test_delv_requires_exact_zone_soa_and_validated_marker(self):
        for output in (
            SOA,
            "; fully validated\n",
            "; fully validated\n" + SOA.replace(NAME, "other.test."),
        ):
            with self.subTest(output=output):
                self.delv_output = output
                _, report = self.scan()
                self.assertEqual(self.findings(report, "chain_of_trust")[0]["status"], "ERROR")

    def test_delv_validation_failure_is_explicit_error(self):
        self.delv_error = "broken trust chain"
        _, report = self.scan()
        self.assertEqual(self.findings(report, "chain_of_trust")[0]["status"], "ERROR")
        self.assertEqual(report["exit_code"], 2)

    def test_missing_dns_utilities_produces_warnings_not_passes(self):
        with patch.object(audit_module.shutil, "which", side_effect=lambda tool: "aws" if tool == "aws" else None):
            _, report = self.scan()
        self.assertEqual(report["exit_code"], 3)
        for check in ("public_delegation", "parent_ds", "chain_of_trust"):
            self.assertEqual(self.findings(report, check)[0]["status"], "WARN")

    def test_vpc_disabled_is_failure_and_transitions_are_warnings(self):
        for state, expected, code in (
            ("DISABLED", "FAIL", 1), ("ENABLING", "WARN", 3),
            ("DISABLING", "WARN", 3), ("UNKNOWN", "ERROR", 2),
        ):
            with self.subTest(state=state):
                self.responses[("route53resolver", "get-resolver-dnssec-config")] = {
                    "ResolverDNSSECConfig": {"ValidationStatus": state},
                }
                _, report = self.scan()
                self.assertEqual(self.findings(report, "vpc_validation")[0]["status"], expected)
                self.assertEqual(report["exit_code"], code)

    def test_custom_dhcp_and_disabled_amazon_dns_warn(self):
        self.responses[("ec2", "describe-vpc-attribute")]["EnableDnsSupport"]["Value"] = False
        self.responses[("ec2", "describe-dhcp-options")]["DhcpOptions"][0]["DhcpConfigurations"][0]["Values"] = [
            {"Value": "10.0.0.10"},
        ]
        _, report = self.scan()
        self.assertEqual(self.findings(report, "amazon_dns_support")[0]["status"], "WARN")
        self.assertEqual(self.findings(report, "dhcp_dns_servers")[0]["status"], "WARN")
        self.assertEqual(report["exit_code"], 3)

    def test_forwarding_needs_downstream_validation_and_filter_uses_vpc(self):
        self.responses[("route53resolver", "list-resolver-rule-associations")] = {
            "ResolverRuleAssociations": [{"ResolverRuleId": "rslvr-123", "Status": "COMPLETE"}],
        }
        _, report = self.scan()
        self.assertEqual(self.findings(report, "resolver_forwarding")[0]["status"], "WARN")
        self.assertEqual(report["exit_code"], 3)
        call = next(call for call in self.calls if "list-resolver-rule-associations" in call)
        self.assertIn("Name=VPCId,Values=vpc-123", call)

    def test_system_rules_do_not_require_downstream_validation(self):
        self.responses[("route53resolver", "list-resolver-rule-associations")] = {
            "ResolverRuleAssociations": [{"ResolverRuleId": "rslvr-123", "Status": "COMPLETE"}],
        }
        self.responses[("route53resolver", "get-resolver-rule")]["ResolverRule"]["RuleType"] = "SYSTEM"
        _, report = self.scan()
        self.assertEqual(report["exit_code"], 0)

    def test_identity_failure_skips_only_that_profile(self):
        self.failed_profile = "expired"
        _, report = self.scan(["expired", "core"])
        self.assertEqual(report["exit_code"], 2)
        self.assertEqual(len(report["identities"]), 1)
        self.assertEqual(self.findings(report, "aws_identity")[0]["status"], "ERROR")
        self.assertEqual(self.findings(report, "vpc_validation")[0]["status"], "OK")

    def test_inventory_denied_is_not_an_empty_success(self):
        self.responses[("route53", "list-hosted-zones")] = audit_module.AuditError("AccessDenied")
        _, report = self.scan()
        self.assertEqual(report["exit_code"], 2)
        self.assertEqual(self.findings(report, "zone_inventory")[0]["status"], "ERROR")
        self.assertEqual(self.findings(report, "vpc_validation")[0]["status"], "OK")

    def test_missing_inventory_list_is_an_error(self):
        self.responses[("ec2", "describe-vpcs")] = {}
        _, report = self.scan()
        self.assertEqual(self.findings(report, "vpc_inventory")[0]["status"], "ERROR")
        self.assertEqual(report["exit_code"], 2)

    def test_empty_inventories_do_not_claim_success(self):
        self.responses[("route53", "list-hosted-zones")] = {"HostedZones": []}
        self.responses[("ec2", "describe-vpcs")] = {"Vpcs": []}
        _, report = self.scan()
        self.assertEqual(report["exit_code"], 3)
        self.assertEqual(self.findings(report, "zone_inventory")[0]["status"], "WARN")
        self.assertEqual(self.findings(report, "vpc_inventory")[0]["status"], "WARN")

    def test_main_persists_json_and_deduplicates_scope(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "nested" / "report.json"
            with contextlib.redirect_stdout(io.StringIO()):
                code = audit_module.main([
                    "--profiles", "core", "core", "--regions", "eu-south-1", "eu-south-1",
                    "--dns-server", "192.0.2.1", "--output", str(output),
                ])
            report = json.loads(output.read_text())
            self.assertEqual(code, 0)
            self.assertEqual(report["scope"]["profiles"], ["core"])
            self.assertEqual(report["scope"]["vpc_regions"], ["eu-south-1"])
            self.assertEqual(report["scope"]["dns_server"], "192.0.2.1")
            self.assertTrue(report["limitations"])
            dns_calls = [call for call in self.calls if call[0] in ("dig", "delv")]
            self.assertTrue(all("@192.0.2.1" in call for call in dns_calls))

    def test_main_refuses_overwrite_before_scanning(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "report.json"
            output.write_text("existing evidence")
            with self.assertRaises(SystemExit) as exc:
                audit_module.main([
                    "--profiles", "core", "--regions", "eu-south-1", "--output", str(output),
                ])
            self.assertEqual(exc.exception.code, 2)
            self.assertEqual(output.read_text(), "existing evidence")
            self.assertFalse(self.calls)

    def test_main_reports_write_errors(self):
        with tempfile.TemporaryDirectory() as directory:
            parent_file = Path(directory) / "not-a-directory"
            parent_file.write_text("occupied")
            with contextlib.redirect_stdout(io.StringIO()):
                code = audit_module.main([
                    "--profiles", "core", "--regions", "eu-south-1",
                    "--output", str(parent_file / "report.json"),
                ])
            self.assertEqual(code, 2)
            self.assertIn("Cannot write JSON report", self.stderr.getvalue())

    def test_error_report_is_persisted_even_when_identity_fails(self):
        self.failed_profile = "expired"
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "report.json"
            with contextlib.redirect_stdout(io.StringIO()):
                code = audit_module.main([
                    "--profiles", "expired", "--regions", "eu-south-1", "--output", str(output),
                ])
            report = json.loads(output.read_text())
            self.assertEqual(code, 2)
            self.assertEqual(report["exit_code"], 2)
            self.assertEqual(report["summary"]["ERROR"], 1)
            self.assertEqual(report["identities"], [])
            self.assertIn("SSO session expired", report["findings"][0]["detail"])

    def test_malformed_nested_responses_produce_errors_and_continue(self):
        cases = [
            (("route53", "get-dnssec"), {"Status": None}, "zone_audit"),
            (("ec2", "describe-dhcp-options"), {"DhcpOptions": [None]}, "vpc_dns_path"),
            (
                ("ec2", "describe-dhcp-options"),
                {"DhcpOptions": [{"DhcpConfigurations": [None]}]},
                "vpc_dns_path",
            ),
            (
                ("ec2", "describe-dhcp-options"),
                {"DhcpOptions": [{"DhcpConfigurations": [{
                    "Key": "domain-name-servers", "Values": [{}],
                }]}]},
                "vpc_dns_path",
            ),
            (
                ("route53resolver", "list-resolver-rule-associations"),
                {"ResolverRuleAssociations": [None]},
                "resolver_forwarding",
            ),
        ]
        original = deepcopy(self.responses)
        for operation, response, check in cases:
            with self.subTest(operation=operation, response=response):
                self.responses = deepcopy(original)
                self.responses[operation] = response
                _, report = self.scan()
                self.assertEqual(report["exit_code"], 2)
                self.assertEqual(self.findings(report, check)[0]["status"], "ERROR")
                self.assertTrue(self.findings(report, "vpc_validation"))

    def test_null_ds_record_is_error_not_a_crash(self):
        self.responses[("route53", "get-dnssec")]["KeySigningKeys"][0]["DSRecord"] = None
        _, report = self.scan()
        self.assertEqual(self.findings(report, "ksk_ds")[0]["status"], "ERROR")
        self.assertEqual(report["exit_code"], 2)

    def test_invalid_args_and_missing_aws_fail_before_scanning(self):
        variants = [
            ["--timeout", "0"], ["--timeout", "not-an-int"],
            ["--dns-server", "not-an-ip"], ["--regions", "not-a-region"],
        ]
        for extra in variants:
            with self.subTest(extra=extra), self.assertRaises(SystemExit) as exc:
                audit_module.main(["--profiles", "core", "--regions", "eu-south-1", *extra])
            self.assertEqual(exc.exception.code, 2)
        with patch.object(audit_module.shutil, "which", return_value=None):
            with self.assertRaises(SystemExit) as exc:
                audit_module.main(["--profiles", "core", "--regions", "eu-south-1"])
            self.assertEqual(exc.exception.code, 2)
        self.assertFalse(self.calls)

    def test_invalid_aws_json_is_explicit_error(self):
        audit = audit_module.Audit(90, None)
        for value in ("not JSON", "[]"):
            with self.subTest(value=value), patch.object(audit_module, "run_command", return_value=value):
                with self.assertRaises(audit_module.AuditError):
                    audit.aws("core", "eu-south-1", "sts", "get-caller-identity")

    def test_malformed_dns_ds_is_explicit_error(self):
        self.published_ds = ["not a valid DS"]
        _, report = self.scan()
        self.assertEqual(self.findings(report, "parent_ds")[0]["status"], "ERROR")


class CommandTests(unittest.TestCase):
    def test_timeout_and_execution_errors(self):
        for error in (subprocess.TimeoutExpired(["aws"], 3), FileNotFoundError("missing")):
            with self.subTest(error=error), patch.object(audit_module.subprocess, "run", side_effect=error):
                with self.assertRaises(audit_module.AuditError):
                    audit_module.run_command(["aws"], 3)

    def test_nonzero_process_exit_is_not_silently_ignored(self):
        result = subprocess.CompletedProcess(["aws"], 254, "", "AccessDenied")
        with patch.object(audit_module.subprocess, "run", return_value=result):
            with self.assertRaisesRegex(audit_module.AuditError, "AccessDenied"):
                audit_module.run_command(["aws"], 3)

    def test_commands_use_no_shell_and_disable_pagers_and_prompts(self):
        result = subprocess.CompletedProcess(["aws"], 0, "{}", "")
        with patch.object(audit_module.subprocess, "run", return_value=result) as runner:
            self.assertEqual(audit_module.run_command(["aws"], 3), "{}")
        kwargs = runner.call_args.kwargs
        self.assertNotIn("shell", kwargs)
        self.assertEqual(kwargs["env"]["AWS_PAGER"], "")
        self.assertEqual(kwargs["env"]["AWS_CLI_AUTO_PROMPT"], "off")

    def test_canonical_records_and_names(self):
        self.assertEqual(audit_module.canonical_name("EXAMPLE.TEST"), NAME)
        self.assertEqual(audit_module.canonical_ds(DS.lower()), DS)
        for name in ("", "-q injected", "a" * 64 + ".test"):
            with self.subTest(name=name), self.assertRaises(audit_module.AuditError):
                audit_module.canonical_name(name)


if __name__ == "__main__":
    unittest.main()
