import csv
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import manage_kms_keys as verifier


ACCOUNT = "830192246553"
KEY_ID = "0045a629-37bf-45cb-bbc8-93d9ac6fd20c"
OTHER_ID = "0063e705-2872-4b1c-a782-94b7728864bc"
KEY_ARN = f"arn:aws:kms:eu-south-1:{ACCOUNT}:key/{KEY_ID}"
OTHER_ARN = f"arn:aws:kms:eu-south-1:{ACCOUNT}:key/{OTHER_ID}"
IDENTITY = {
    "Account": ACCOUNT,
    "Arn": f"arn:aws:sts::{ACCOUNT}:assumed-role/ReadOnly/session",
}


def log_group(name="/aws/ecs/pn-simulatore-recapiti", key=KEY_ARN):
    group = {
        "logGroupName": name,
        "arn": f"arn:aws:logs:eu-south-1:{ACCOUNT}:log-group:{name}:*",
    }
    if key is not None:
        group["kmsKeyId"] = key
    return group


class AssociationVerifierTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.directory = Path(directory.name)
        self.input = self.directory / "keys.csv"
        self.output = self.directory / "associations.csv"
        self.summary = self.directory / "associations_summary.csv"
        self.client = verifier.AwsClient("read-only", "eu-south-1", 15)
        runner_patch = patch.object(verifier.subprocess, "run")
        self.runner = runner_patch.start()
        self.addCleanup(runner_patch.stop)
        self.runner.side_effect = AssertionError("Chiamata AWS non simulata")

    def mock_responses(self, *responses):
        self.runner.side_effect = [
            subprocess.CompletedProcess([], 0, json.dumps(response), "")
            for response in responses
        ]

    def write_input(self, rows=None):
        if rows is None:
            rows = [
                [KEY_ID, "alias/test", "Microservice=pn-simulatore-recapiti", "", "2026-10-21T10:00:00+02:00"],
                [OTHER_ID, "", "Microservice=pn-delayer", "", ""],
            ]
        with self.input.open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.writer(stream)
            writer.writerow(verifier.INPUT_FIELDS)
            writer.writerows(rows)

    def read_csv(self, path):
        with path.open(encoding="utf-8-sig", newline="") as stream:
            return list(csv.DictReader(stream))

    def main(self, *extra):
        arguments = [
            "manage_kms_keys.py", "--input", str(self.input),
            "--output", str(self.output), "--profile", "read-only",
            *extra,
        ]
        with patch.object(verifier.sys, "argv", arguments):
            with patch.object(verifier.logging, "basicConfig"):
                with patch.object(
                    verifier.ResourceScanner, "scan", return_value=verifier.ScanResult()
                ):
                    return verifier.main()

    def test_load_keys_filter_preserves_metadata(self):
        self.write_input()
        keys = verifier.load_keys(self.input, "pn-simulatore-recapiti")
        self.assertEqual(len(keys), 1)
        self.assertEqual(keys[0].key_id, KEY_ID)
        self.assertEqual(keys[0].alias, "alias/test")
        self.assertEqual(keys[0].last_usage_date, "2026-10-21T10:00:00+02:00")
        self.assertEqual(len(verifier.load_keys(self.input)), 2)

    def test_no_tag_and_multi_region_ids_are_supported(self):
        mrk = "mrk-" + "a" * 32
        self.write_input([[mrk, "", "Owner=team", "", ""]])
        key = verifier.load_keys(self.input)[0]
        self.assertEqual(key.key_id, mrk)
        self.assertEqual(key.microservice, verifier.MISSING_MICROSERVICE)

    def test_invalid_csv_fails_before_any_aws_call(self):
        invalid_rows = [
            [[KEY_ID, "", "", ""]],
            [[KEY_ID, "", "", "", "", "extra"]],
            [["invalid", "", "", "", ""]],
            [[KEY_ID, "", "Microservice=a; Microservice=b", "", ""]],
            [[KEY_ID, "", "", "", ""], [KEY_ID, "", "", "", ""]],
            [],
        ]
        for rows in invalid_rows:
            with self.subTest(rows=rows):
                self.write_input(rows)
                with self.assertLogs(verifier.LOGGER, level="ERROR"):
                    self.assertEqual(self.main(), 1)
        self.runner.assert_not_called()
        self.assertFalse(self.output.exists())

    def test_invalid_header_and_unknown_filter_fail(self):
        self.input.write_text("KeyId,KeyArn\nx,y\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Intestazione"):
            verifier.load_keys(self.input)
        self.write_input()
        with self.assertRaisesRegex(ValueError, "Nessuna chiave"):
            verifier.load_keys(self.input, "missing")

    def test_client_uses_read_only_cli_with_region_and_timeout(self):
        self.mock_responses(IDENTITY)
        self.assertEqual(verifier.get_account(self.client), (ACCOUNT, "aws"))
        args, kwargs = self.runner.call_args
        command = args[0]
        self.assertEqual(command[:3], ["aws", "sts", "get-caller-identity"])
        self.assertEqual(command[command.index("--profile") + 1], "read-only")
        self.assertEqual(command[command.index("--region") + 1], "eu-south-1")
        self.assertIn("--no-cli-auto-prompt", command)
        self.assertIn("--no-cli-pager", command)
        self.assertEqual(kwargs["timeout"], 15)
        self.assertEqual(self.client.calls, 1)
        with self.assertRaisesRegex(ValueError, "non prevista"):
            self.client.call("kms", "schedule-key-deletion")
        self.assertEqual(self.runner.call_count, 1)

    def test_client_failures_are_explicit(self):
        cases = [
            (subprocess.TimeoutExpired("aws", 15), "timeout"),
            (FileNotFoundError("aws"), "Impossibile"),
            (subprocess.CompletedProcess([], 1, "", "AccessDenied"), "AccessDenied"),
            (subprocess.CompletedProcess([], 9, "", ""), "exit code 9"),
            (subprocess.CompletedProcess([], 0, "bad JSON", ""), "JSON non valido"),
            (subprocess.CompletedProcess([], 0, "[]", ""), "oggetto JSON"),
        ]
        for response, message in cases:
            with self.subTest(message=message):
                self.runner.side_effect = [response]
                with self.assertRaisesRegex(verifier.ScanError, message):
                    self.client.call("logs", "describe-log-groups")

    def test_inconsistent_identity_aborts_before_scan_and_export(self):
        self.write_input()
        self.mock_responses({**IDENTITY, "Account": "111111111111"})
        with self.assertLogs(verifier.LOGGER, level="ERROR"):
            self.assertEqual(self.main(), 1)
        self.assertEqual(self.runner.call_count, 1)
        self.assertFalse(self.output.exists())

    def test_account_identity_requires_valid_arn_and_supports_partitions(self):
        for arn in (None, "", f"arn:aws:iam::111111111111:root"):
            with self.subTest(arn=arn):
                self.mock_responses({**IDENTITY, "Arn": arn})
                with self.assertRaisesRegex(verifier.ScanError, "STS"):
                    verifier.get_account(self.client)
        self.mock_responses({
            "Account": ACCOUNT, "Arn": f"arn:aws-us-gov:iam::{ACCOUNT}:user/test"
        })
        self.assertEqual(verifier.get_account(self.client), (ACCOUNT, "aws-us-gov"))

    def test_pagination_is_explicit_and_shared_key_is_counted_once(self):
        group = log_group()
        self.mock_responses(
            {"logGroups": [group, log_group("unencrypted", None)], "nextToken": "page2"},
            {"logGroups": [group, log_group("/aws/lambda/another"), log_group("other", OTHER_ARN)]},
        )
        with self.assertLogs(verifier.LOGGER, level="INFO") as logs:
            result = verifier.scan_cloudwatch_logs(self.client, {KEY_ARN})
        self.assertFalse(result.errors)
        self.assertEqual(len(result.associations[KEY_ARN]), 2)
        self.assertEqual(result.resource_count, 5)
        self.assertEqual(result.status(KEY_ARN), "ASSOCIATED")
        self.assertEqual(result.status(OTHER_ARN), "NO_ASSOCIATION_FOUND")
        commands = [call.args[0] for call in self.runner.call_args_list]
        self.assertTrue(all("--no-paginate" in command for command in commands))
        requests = [
            json.loads(command[command.index("--cli-input-json") + 1])
            for command in commands
        ]
        self.assertEqual(requests, [{"limit": 50}, {"limit": 50, "nextToken": "page2"}])
        self.assertTrue(all("--next-token" not in command for command in commands))
        self.assertTrue(all("--limit" not in command for command in commands))
        self.assertIn("pagina 2 completata", "\n".join(logs.output))

    def test_exact_arn_match_does_not_cross_account_or_region(self):
        self.mock_responses({"logGroups": [
            log_group("other-account", KEY_ARN.replace(ACCOUNT, "111111111111")),
            log_group("other-region", KEY_ARN.replace("eu-south-1", "eu-west-1")),
        ]})
        result = verifier.scan_cloudwatch_logs(self.client, {KEY_ARN})
        self.assertFalse(result.associations)
        self.assertFalse(result.errors)

    def test_second_page_failure_retains_evidence_and_marks_unmatched_incomplete(self):
        self.runner.side_effect = [
            subprocess.CompletedProcess([], 0, json.dumps({
                "logGroups": [log_group()], "nextToken": "page2"
            }), ""),
            subprocess.CompletedProcess([], 1, "", "AccessDenied"),
        ]
        with self.assertLogs(verifier.LOGGER, level="ERROR"):
            result = verifier.scan_cloudwatch_logs(self.client, {KEY_ARN, OTHER_ARN})
        self.assertEqual(result.status(KEY_ARN), "ASSOCIATED")
        self.assertEqual(result.status(OTHER_ARN), "SCAN_INCOMPLETE")
        self.assertIn("pagina 2", result.errors[0])

    def test_bad_page_or_resource_never_produces_clean_negative(self):
        for payload in (
            {}, {"logGroups": None}, {"logGroups": {}},
            {"logGroups": [None]},
            {"logGroups": [{"logGroupName": "missing-arn"}]},
            {"logGroups": [{**log_group(), "kmsKeyId": "alias/test"}]},
            {"logGroups": [{**log_group(), "kmsKeyId": None}]},
        ):
            with self.subTest(payload=payload):
                self.mock_responses(payload)
                with self.assertLogs(verifier.LOGGER, level="ERROR"):
                    result = verifier.scan_cloudwatch_logs(self.client, {KEY_ARN})
                self.assertEqual(result.status(KEY_ARN), "SCAN_INCOMPLETE")

    def test_invalid_and_repeated_tokens_stop_scanning(self):
        for token in ("", 42):
            with self.subTest(token=token):
                self.mock_responses({"logGroups": [], "nextToken": token})
                with self.assertLogs(verifier.LOGGER, level="ERROR"):
                    result = verifier.scan_cloudwatch_logs(self.client, {KEY_ARN})
                self.assertTrue(result.errors)
        self.mock_responses(
            {"logGroups": [], "nextToken": "same"},
            {"logGroups": [], "nextToken": "same"},
        )
        with self.assertLogs(verifier.LOGGER, level="ERROR"):
            result = verifier.scan_cloudwatch_logs(self.client, {KEY_ARN})
        self.assertEqual(len(result.errors), 1)

    def test_full_run_writes_evidence_metadata_and_distinct_summary(self):
        self.write_input()
        self.mock_responses(
            IDENTITY,
            {"logGroups": [log_group()], "nextToken": "p2"},
            {"logGroups": [log_group("/aws/lambda/function")]},
        )
        self.assertEqual(self.main(), 0)
        rows = self.read_csv(self.output)
        summary = {row["Microservice"]: row for row in self.read_csv(self.summary)}
        self.assertEqual(len(rows), 3)
        self.assertTrue(self.output.read_bytes().startswith(b"\xef\xbb\xbf"))
        associated = [row for row in rows if row["Status"] == "ASSOCIATED"]
        self.assertEqual(len(associated), 2)
        self.assertEqual(
            {row["ResourceName"] for row in associated},
            {"/aws/ecs/pn-simulatore-recapiti", "/aws/lambda/function"},
        )
        for row in associated:
            self.assertEqual(row["KeyArn"], KEY_ARN)
            self.assertEqual(row["KeyReference"], KEY_ARN)
            self.assertEqual(row["Property"], "kmsKeyId")
            self.assertEqual(row["ResourceType"], "AWS::Logs::LogGroup")
            self.assertEqual(row["last_usage_date"], "2026-10-21T10:00:00+02:00")
        self.assertTrue(all(row["ScanComplete"] == "true" for row in rows))
        self.assertTrue(all(
            row["CheckedServices"] == "; ".join(verifier.CHECKED_SERVICES)
            for row in rows
        ))
        self.assertTrue(all(row["AccountId"] == ACCOUNT for row in rows))
        self.assertEqual(summary["pn-simulatore-recapiti"]["AssociatedKeys"], "1")
        self.assertEqual(summary["pn-simulatore-recapiti"]["Associations"], "2")
        self.assertEqual(summary["pn-delayer"]["NoAssociationFoundKeys"], "1")
        self.assertEqual(summary["pn-delayer"]["AssociatedKeys"], "0")
        self.assertEqual(len(verifier.load_keys(self.input)), 2)

    def test_filter_still_scans_all_log_groups_not_only_service_names(self):
        self.write_input()
        self.mock_responses(IDENTITY, {"logGroups": [log_group("unrelated-name")]})
        self.assertEqual(self.main("--microservice", "pn-simulatore-recapiti"), 0)
        rows = self.read_csv(self.output)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["ResourceName"], "unrelated-name")
        self.assertNotIn("--log-group-name-prefix", self.runner.call_args.args[0])

    def test_main_derives_account_from_profile_and_uses_fixed_region(self):
        self.write_input()
        account = "111111111111"
        reference = KEY_ARN.replace(ACCOUNT, account)
        self.mock_responses(
            {"Account": account, "Arn": f"arn:aws:iam::{account}:user/test"},
            {"logGroups": [log_group(key=reference)]},
        )
        self.assertEqual(self.main(), 0)
        rows = {row["id"]: row for row in self.read_csv(self.output)}
        self.assertEqual(rows[KEY_ID]["AccountId"], account)
        self.assertEqual(rows[KEY_ID]["KeyArn"], reference)
        self.assertEqual(rows[KEY_ID]["Status"], "ASSOCIATED")
        self.assertTrue(all(row["Region"] == "eu-south-1" for row in rows.values()))
        for call in self.runner.call_args_list:
            command = call.args[0]
            self.assertEqual(command[command.index("--region") + 1], "eu-south-1")

    def test_failed_scan_exports_incomplete_report_with_nonzero_exit(self):
        self.write_input()
        self.runner.side_effect = [
            subprocess.CompletedProcess([], 0, json.dumps(IDENTITY), ""),
            subprocess.TimeoutExpired("aws", 15),
        ]
        with self.assertLogs(verifier.LOGGER, level="ERROR"):
            self.assertEqual(self.main(), 2)
        rows = self.read_csv(self.output)
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row["Status"] == "SCAN_INCOMPLETE" for row in rows))
        self.assertTrue(all(row["ScanComplete"] == "false" for row in rows))
        self.assertTrue(all("timeout" in row["ScanErrors"] for row in rows))

    def test_partial_report_keeps_positive_evidence_but_marks_entire_scan_incomplete(self):
        self.write_input()
        self.runner.side_effect = [
            subprocess.CompletedProcess([], 0, json.dumps(IDENTITY), ""),
            subprocess.CompletedProcess([], 0, json.dumps({
                "logGroups": [log_group()], "nextToken": "page2"
            }), ""),
            subprocess.CompletedProcess([], 1, "", "AccessDenied"),
        ]
        with self.assertLogs(verifier.LOGGER, level="ERROR"):
            self.assertEqual(self.main(), 2)
        rows = {row["id"]: row for row in self.read_csv(self.output)}
        self.assertEqual(rows[KEY_ID]["Status"], "ASSOCIATED")
        self.assertEqual(rows[OTHER_ID]["Status"], "SCAN_INCOMPLETE")
        self.assertTrue(all(row["ScanComplete"] == "false" for row in rows.values()))
        self.assertTrue(all("AccessDenied" in row["ScanErrors"] for row in rows.values()))
        summary = {row["Microservice"]: row for row in self.read_csv(self.summary)}
        self.assertEqual(summary["pn-simulatore-recapiti"]["AssociatedKeys"], "1")
        self.assertEqual(summary["pn-delayer"]["ScanIncompleteKeys"], "1")
        self.assertEqual(summary["pn-delayer"]["NoAssociationFoundKeys"], "0")

    def test_successful_empty_scan_exports_clean_negatives(self):
        self.write_input()
        self.mock_responses(IDENTITY, {"logGroups": []})
        self.assertEqual(self.main(), 0)
        self.assertTrue(all(
            row["Status"] == "NO_ASSOCIATION_FOUND"
            for row in self.read_csv(self.output)
        ))

    def test_output_cannot_overwrite_input_or_use_missing_directory(self):
        self.write_input()
        original = self.input.read_bytes()
        for output in (self.input, self.directory / "missing" / "out.csv"):
            with self.subTest(output=output):
                with self.assertLogs(verifier.LOGGER, level="ERROR"):
                    self.assertEqual(self.main("--output", str(output)), 1)
        self.assertEqual(self.input.read_bytes(), original)
        self.runner.assert_not_called()

    def test_invalid_sts_account_and_interrupt(self):
        for account in (None, "", "123", 830192246553):
            with self.subTest(account=account):
                self.mock_responses({**IDENTITY, "Account": account})
                with self.assertRaisesRegex(verifier.ScanError, "account"):
                    verifier.get_account(self.client)
        self.write_input()
        self.runner.side_effect = KeyboardInterrupt()
        with self.assertLogs(verifier.LOGGER, level="WARNING"):
            self.assertEqual(self.main(), 130)
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
