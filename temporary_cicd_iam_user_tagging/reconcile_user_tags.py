#!/usr/bin/env python3
"""Reconcile IAM user tags from the policies attached to their groups."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

TAG_BATCH_SIZE = 50
OUTPUT_DIRECTORY = Path(__file__).resolve().parent / "output"


class TagConflictError(RuntimeError):
    """Raised when two policies assign different values to the same tag."""


@dataclass(frozen=True)
class Change:
    user_name: str
    tags_to_set: dict[str, str]
    tags_to_remove: list[str]

    def as_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {"user": self.user_name}
        if self.tags_to_set:
            result["set"] = self.tags_to_set
        if self.tags_to_remove:
            result["remove"] = self.tags_to_remove
        return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Allinea i tag degli utenti IAM ai tag delle policy collegate ai "
            "gruppi di appartenenza."
        ),
        epilog=(
            "È obbligatorio scegliere una modalità: --analysis esegue solo "
            "letture e produce il piano; --apply applica le modifiche."
        ),
    )
    parser.add_argument(
        "--profile",
        required=True,
        help="Profilo AWS configurato localmente.",
    )
    parser.add_argument(
        "--tag-prefix",
        default="pn-",
        help="Prefisso dei tag da propagare (default: pn-).",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--analysis",
        action="store_true",
        help=(
            "Analizza lo stato IAM e produce il report senza apportare "
            "alcuna modifica."
        ),
    )
    mode.add_argument(
        "--apply",
        action="store_true",
        help="Applica agli utenti IAM le modifiche indicate nel report.",
    )
    parser.add_argument(
        "--remove-stale",
        action="store_true",
        help=(
            "Include nel piano i tag col prefisso indicato che non derivano più "
            "da policy di gruppo; vengono rimossi solo insieme a --apply."
        ),
    )
    args = parser.parse_args()
    if not args.analysis and not args.apply:
        parser.error(
            "specificare --analysis per la sola analisi senza modifiche, "
            "oppure --apply per modificare i tag degli utenti IAM"
        )
    return args


def paginate(
    iam: Any, operation_name: str, result_key: str, **kwargs: Any
) -> Iterator[dict[str, Any]]:
    paginator = iam.get_paginator(operation_name)
    for page in paginator.paginate(**kwargs):
        yield from page.get(result_key, [])


def list_prefixed_tags(
    iam: Any, operation_name: str, tag_prefix: str, **kwargs: Any
) -> dict[str, str]:
    """Read all pages returned by an IAM list-*-tags operation."""
    operation = getattr(iam, operation_name)
    marker: str | None = None
    tags: dict[str, str] = {}

    while True:
        request = dict(kwargs)
        if marker:
            request["Marker"] = marker

        response = operation(**request)
        for tag in response.get("Tags", []):
            if tag["Key"].startswith(tag_prefix):
                tags[tag["Key"]] = tag["Value"]

        if not response.get("IsTruncated"):
            return tags

        marker = response.get("Marker")
        if not marker:
            raise RuntimeError(
                f"{operation_name} ha restituito IsTruncated senza Marker"
            )


def merge_tags(
    destination: dict[str, str],
    incoming: dict[str, str],
    *,
    user_name: str,
    policy_arn: str,
) -> None:
    for key, value in incoming.items():
        current_value = destination.get(key)
        if current_value is not None and current_value != value:
            raise TagConflictError(
                f"Tag in conflitto per l'utente {user_name}: {key} vale "
                f"{current_value!r} in un'altra policy e {value!r} in {policy_arn}"
            )
        destination[key] = value


def build_expected_tags(iam: Any, tag_prefix: str) -> dict[str, dict[str, str]]:
    """Return the expected prefixed tags for every user found in IAM groups."""
    expected_by_user: dict[str, dict[str, str]] = {}
    policy_tags_cache: dict[str, dict[str, str]] = {}

    for group in paginate(iam, "list_groups", "Groups"):
        group_name = group["GroupName"]
        policies = list(
            paginate(
                iam,
                "list_attached_group_policies",
                "AttachedPolicies",
                GroupName=group_name,
            )
        )
        if not policies:
            continue

        users = list(
            paginate(iam, "get_group", "Users", GroupName=group_name)
        )
        if not users:
            continue

        for policy in policies:
            policy_arn = policy["PolicyArn"]
            if policy_arn not in policy_tags_cache:
                policy_tags_cache[policy_arn] = list_prefixed_tags(
                    iam,
                    "list_policy_tags",
                    tag_prefix,
                    PolicyArn=policy_arn,
                )

            policy_tags = policy_tags_cache[policy_arn]
            for user in users:
                user_name = user["UserName"]
                expected = expected_by_user.setdefault(user_name, {})
                merge_tags(
                    expected,
                    policy_tags,
                    user_name=user_name,
                    policy_arn=policy_arn,
                )

    return expected_by_user


def calculate_changes(
    iam: Any,
    expected_by_user: dict[str, dict[str, str]],
    tag_prefix: str,
    remove_stale: bool,
) -> list[Change]:
    changes: list[Change] = []

    for user in paginate(iam, "list_users", "Users"):
        user_name = user["UserName"]
        expected = expected_by_user.get(user_name, {})
        current = list_prefixed_tags(
            iam, "list_user_tags", tag_prefix, UserName=user_name
        )

        tags_to_set = {
            key: value
            for key, value in expected.items()
            if current.get(key) != value
        }
        tags_to_remove = (
            sorted(key for key in current if key not in expected)
            if remove_stale
            else []
        )

        if tags_to_set or tags_to_remove:
            changes.append(
                Change(
                    user_name=user_name,
                    tags_to_set=tags_to_set,
                    tags_to_remove=tags_to_remove,
                )
            )

    return changes


def chunks(items: list[Any], size: int) -> Iterator[list[Any]]:
    for index in range(0, len(items), size):
        yield items[index : index + size]


def apply_changes(iam: Any, changes: list[Change]) -> tuple[int, int]:
    tags_set = 0
    tags_removed = 0

    for change in changes:
        tags = [
            {"Key": key, "Value": value}
            for key, value in sorted(change.tags_to_set.items())
        ]
        for batch in chunks(tags, TAG_BATCH_SIZE):
            iam.tag_user(UserName=change.user_name, Tags=batch)
            tags_set += len(batch)

        for batch in chunks(change.tags_to_remove, TAG_BATCH_SIZE):
            iam.untag_user(UserName=change.user_name, TagKeys=batch)
            tags_removed += len(batch)

    return tags_set, tags_removed


def build_report(
    *,
    account_id: str,
    profile: str,
    tag_prefix: str,
    apply: bool,
    remove_stale: bool,
    changes: list[Change],
) -> dict[str, Any]:
    mode = "APPLY" if apply else "ANALYSIS"
    return {
        "notice": (
            "APPLY MODE, changes will be made to IAM user tags."
            if apply
            else "ANALYSIS MODE, no changes will be made."
        ),
        "accountId": account_id,
        "profile": profile,
        "mode": mode,
        "status": "PLANNED" if apply else "ANALYSIS_COMPLETE",
        "tagPrefix": tag_prefix,
        "removeStale": remove_stale,
        "usersWithChanges": len(changes),
        "changes": [change.as_dict() for change in changes],
    }


def write_report(
    report: dict[str, Any], report_path: Path | None = None
) -> Path:
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    if report_path is None:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        mode = report["mode"].lower().replace("_", "-")
        report_path = OUTPUT_DIRECTORY / (
            f"user-tagging-{timestamp}-{report['accountId']}-{mode}.json"
        )

    report_path.write_text(
        json.dumps(report, indent=2) + "\n",
        encoding="utf-8",
    )
    return report_path


def main() -> int:
    args = parse_args()
    if not args.tag_prefix:
        print("ERRORE: --tag-prefix non può essere vuoto", file=sys.stderr)
        return 2

    try:
        import boto3
        from botocore.exceptions import BotoCoreError, ClientError, ProfileNotFound
    except ModuleNotFoundError:
        print(
            "ERRORE: dipendenza boto3 non installata. Eseguire "
            "'python3 -m pip install -r requirements.txt'.",
            file=sys.stderr,
        )
        return 1

    try:
        session = boto3.Session(profile_name=args.profile)
        account_id = session.client("sts").get_caller_identity()["Account"]
        iam = session.client("iam")

        expected_by_user = build_expected_tags(iam, args.tag_prefix)
        changes = calculate_changes(
            iam,
            expected_by_user,
            args.tag_prefix,
            args.remove_stale,
        )
        report = build_report(
            account_id=account_id,
            profile=args.profile,
            tag_prefix=args.tag_prefix,
            apply=args.apply,
            remove_stale=args.remove_stale,
            changes=changes,
        )
        report_path = write_report(report)
        print(report["notice"], file=sys.stderr)

        if not args.apply:
            print(json.dumps(report, indent=2))
            print(f"\nReport salvato in: {report_path}", file=sys.stderr)
            print(
                "\nANALYSIS MODE completata: nessuna modifica applicata. "
                "Usare --apply per eseguire il piano.",
                file=sys.stderr,
            )
            return 0

        try:
            tags_set, tags_removed = apply_changes(iam, changes)
        except (BotoCoreError, ClientError) as error:
            report["status"] = "FAILED"
            report["error"] = str(error)
            write_report(report, report_path)
            print(json.dumps(report, indent=2))
            print(f"\nReport FAILED salvato in: {report_path}", file=sys.stderr)
            raise

        report["status"] = "COMPLETED"
        report["tagsSet"] = tags_set
        report["tagsRemoved"] = tags_removed
        write_report(report, report_path)
        print(json.dumps(report, indent=2))
        print(f"\nReport salvato in: {report_path}", file=sys.stderr)
        print(
            f"\nApplicazione completata: {tags_set} tag impostati, "
            f"{tags_removed} tag rimossi.",
            file=sys.stderr,
        )
        return 0
    except ProfileNotFound as error:
        print(f"ERRORE: {error}", file=sys.stderr)
    except TagConflictError as error:
        print(f"ERRORE: {error}. Nessuna modifica applicata.", file=sys.stderr)
    except (BotoCoreError, ClientError) as error:
        print(f"ERRORE AWS: {error}", file=sys.stderr)

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
