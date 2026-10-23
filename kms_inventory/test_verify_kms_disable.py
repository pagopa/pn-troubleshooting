import csv
import json
import logging
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

import manage_kms_keys as v


ACCOUNT = "830192246553"
PREFIX = f"arn:aws:kms:eu-south-1:{ACCOUNT}:key/"
NOW = datetime.now(timezone.utc)
OLD = (NOW - timedelta(days=400)).isoformat()
RECENT = (NOW - timedelta(days=5)).isoformat()
READ_OPERATIONS = frozenset(v.AwsClient.ALLOWED_OPERATIONS) | {v.DESCRIBE_KEY}
WRITE_OPERATIONS = frozenset(v.AwsClient.WRITE_OPERATIONS)


def setUpModule():
    logging.disable(logging.CRITICAL)


def tearDownModule():
    logging.disable(logging.NOTSET)


def key_id(number):
    return f"{number:08d}-0000-4000-8000-000000000000"


def arn(number):
    return PREFIX + key_id(number)


class FakeClient:
    def __init__(self, allow_writes=False, failing=(), states=None, managers=None):
        self.allow_writes = allow_writes
        self.failing = set(failing)
        self.states = states or {}
        self.managers = managers or {}
        self.calls = []

    def call(self, service, operation, *args):
        if (service, operation) not in READ_OPERATIONS and not (
            self.allow_writes and (service, operation) in WRITE_OPERATIONS
        ):
            raise ValueError(f"Operazione AWS non prevista: {service} {operation}")
        if operation == "get-caller-identity":
            return {"Account": ACCOUNT, "Arn": f"arn:aws:sts::{ACCOUNT}:assumed-role/r/u"}
        if operation == "describe-key":
            key = args[-1]
            self.calls.append((operation, key))
            state = self.states.get(key, "Disabled")
            if isinstance(state, list):
                state = state.pop(0)
            if state == "FAIL":
                raise v.ScanError("NotFoundException")
            return {"KeyMetadata": {
                "KeyState": state, "KeyManager": self.managers.get(key, "CUSTOMER"),
            }}
        request = json.loads(args[-1])
        key = request["KeyId"]
        self.calls.append((operation, key))
        if key in self.failing:
            raise v.ScanError("AccessDeniedException")
        if operation == "schedule-key-deletion":
            self.last_request = request
            return {"KeyId": key, "DeletionDate": "2026-11-22T11:00:00+01:00",
                    "KeyState": "PendingDeletion"}
        return {}


def report_row(number, microservice, status="NO_ASSOCIATION_FOUND", resource="",
               complete="true", created=OLD, used=""):
    row = dict.fromkeys(v.REPORT_FIELDS, "")
    row.update(
        id=key_id(number), Microservice=microservice, KeyArn=arn(number),
        Status=status, ResourceType=resource, AccountId=ACCOUNT,
        Region="eu-south-1", ScanComplete=complete, creation_date=created,
        last_usage_date=used,
    )
    return row


class DisableKmsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.report = self.dir / "report.csv"
        self.output = self.dir / "out.csv"
        patcher = mock.patch.object(
            v, "scan_resources", side_effect=AssertionError("nessuna scansione attesa")
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def write_report(self, rows):
        with self.report.open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=v.REPORT_FIELDS)
            writer.writeheader()
            writer.writerows(rows)

    def read_output(self, path=None):
        with (path or self.output).open(encoding="utf-8-sig", newline="") as stream:
            return {row["KeyId"]: row for row in csv.DictReader(stream)}

    def run_disable(self, client, microservice="pn-a", apply=False, answer=None):
        prompt = mock.Mock(return_value=answer if answer is not None else microservice)
        v.run_disable(client, self.report, microservice, self.output, apply, prompt=prompt)
        return prompt

    def standard_report(self):
        self.write_report([
            report_row(1, "pn-a"),
            report_row(2, "pn-a", "ASSOCIATED", "AWS::SQS::Queue"),
            report_row(2, "pn-a", "ASSOCIATED", "AWS::SNS::Topic"),
            report_row(3, "pn-a", created=RECENT),
            report_row(4, "pn-a", used="2026-10-21T16:03:25.017000+02:00"),
            report_row(5, "pn-a"),
            report_row(6, "pn-b"),
        ])

    def test_dry_run_uses_only_report_and_never_writes(self):
        self.standard_report()
        client = FakeClient()
        prompt = self.run_disable(client)
        out = self.read_output()
        self.assertEqual(set(out), {key_id(n) for n in (1, 2, 3, 4, 5)})
        self.assertEqual(out[key_id(1)]["Outcome"], "DISABLE_CANDIDATE")
        self.assertEqual(out[key_id(2)]["Outcome"], "SKIPPED")
        self.assertIn("AWS::SNS::Topic, AWS::SQS::Queue", out[key_id(2)]["Reason"])
        self.assertEqual(out[key_id(3)]["Outcome"], "ATTENTION")
        self.assertIn("creata da 5 giorni", out[key_id(3)]["Reason"])
        self.assertEqual(out[key_id(4)]["Outcome"], "ATTENTION")
        self.assertIn("ultimo utilizzo nel report: 2026-10-21", out[key_id(4)]["Reason"])
        self.assertEqual(out[key_id(5)]["Outcome"], "DISABLE_CANDIDATE")
        self.assertEqual(client.calls, [])
        prompt.assert_not_called()
        self.assertTrue(all(row["Applied"] == "false" for row in out.values()))

    def test_missing_or_invalid_creation_date_needs_attention(self):
        self.write_report([
            report_row(1, "pn-a", created=""), report_row(2, "pn-a", created="ieri"),
        ])
        self.run_disable(FakeClient())
        out = self.read_output()
        for number in (1, 2):
            self.assertEqual(out[key_id(number)]["Outcome"], "ATTENTION")
            self.assertIn("creation_date", out[key_id(number)]["Reason"])

    def test_min_age_is_configurable(self):
        self.write_report([
            report_row(1, "pn-a", created=(NOW - timedelta(days=40)).isoformat()),
        ])
        v.run_disable(FakeClient(), self.report, "pn-a", self.output, False, 60)
        self.assertEqual(self.read_output()[key_id(1)]["Outcome"], "ATTENTION")

    def test_no_tag_selection(self):
        self.write_report([
            report_row(1, v.MISSING_MICROSERVICE), report_row(2, "pn-a"),
        ])
        self.run_disable(FakeClient(), microservice=v.NO_TAG)
        out = self.read_output()
        self.assertEqual(set(out), {key_id(1)})
        self.assertEqual(out[key_id(1)]["Microservice"], v.NO_TAG)

    def test_apply_requires_typed_confirmation(self):
        self.standard_report()
        client = FakeClient(allow_writes=True)
        with self.assertRaisesRegex(ValueError, "Conferma"):
            self.run_disable(client, apply=True, answer="pn-b")
        self.assertEqual(client.calls, [])
        self.assertEqual(self.read_output()[key_id(1)]["Outcome"], "DISABLE_CANDIDATE")
        self.assertFalse(v.confirm("pn-a", prompt=mock.Mock(side_effect=EOFError)))

    def test_apply_disables_only_candidates(self):
        self.standard_report()
        client = FakeClient(allow_writes=True)
        self.run_disable(client, apply=True)
        self.assertEqual(client.calls, [("disable-key", arn(1)), ("disable-key", arn(5))])
        out = self.read_output()
        for number in (1, 5):
            self.assertEqual(out[key_id(number)]["Outcome"], "DISABLED")
            self.assertEqual(out[key_id(number)]["Applied"], "true")
        for number in (2, 3, 4):
            self.assertEqual(out[key_id(number)]["Applied"], "false")

    def test_disable_error_is_reported_and_others_continue(self):
        self.write_report([report_row(1, "pn-a"), report_row(2, "pn-a")])
        client = FakeClient(allow_writes=True, failing={arn(1)})
        self.run_disable(client, apply=True)
        out = self.read_output()
        self.assertEqual(out[key_id(1)]["Outcome"], "ERROR")
        self.assertIn("AccessDenied", out[key_id(1)]["Reason"])
        self.assertEqual(out[key_id(2)]["Outcome"], "DISABLED")

    def test_writes_blocked_without_apply(self):
        real = v.AwsClient("p", "eu-south-1", 5)
        for operation in ("describe-key", "disable-key", "enable-key",
                          "schedule-key-deletion", "cancel-key-deletion"):
            with self.assertRaisesRegex(ValueError, "non prevista"):
                real.call("kms", operation)
        with self.assertRaisesRegex(ValueError, "non concedibili"):
            v.AwsClient("p", "eu-south-1", 5, extra_operations={("kms", "put-key-policy")})

    def test_each_mode_grants_only_its_operations(self):
        expected = {
            ("disableKMS", False): set(), ("disableKMS", True): {("kms", "disable-key")},
            ("enableKMS", True): {("kms", "enable-key")},
            ("deleteKMS", False): {v.DESCRIBE_KEY},
            ("deleteKMS", True): {v.DESCRIBE_KEY, ("kms", "schedule-key-deletion")},
            ("cancelDeleteKMS", True): {("kms", "cancel-key-deletion")},
        }
        for (mode, apply), operations in expected.items():
            self.assertEqual(v.ACTIONS[mode].operations(apply), operations, mode)
        enable = v.AwsClient("p", "eu-south-1", 5,
                             extra_operations=v.ACTIONS["enableKMS"].operations(True))
        with self.assertRaisesRegex(ValueError, "non prevista"):
            enable.call("kms", "schedule-key-deletion")

    def test_report_validation(self):
        self.write_report([report_row(1, "pn-a", complete="false")])
        with self.assertRaisesRegex(ValueError, "incompleta"):
            self.run_disable(FakeClient())
        self.write_report([report_row(1, "pn-a")])
        with self.assertRaisesRegex(ValueError, "Nessuna chiave"):
            self.run_disable(FakeClient(), microservice="pn-z")
        other = report_row(1, "pn-a")
        other["AccountId"] = "111111111111"
        self.write_report([other])
        with self.assertRaisesRegex(ValueError, "account"):
            self.run_disable(FakeClient())

    def test_enable_rollback(self):
        self.standard_report()
        self.run_disable(FakeClient(allow_writes=True), apply=True)
        client = FakeClient(allow_writes=True)
        prompt = mock.Mock(return_value="pn-a")
        dry = v.run_enable(client, self.output, self.dir / "dry.csv", False, prompt)
        self.assertEqual([r["Outcome"] for r in dry], ["ENABLE_CANDIDATE"] * 2)
        self.assertEqual(client.calls, [])
        prompt.assert_not_called()
        rollback = self.dir / "rollback.csv"
        v.run_enable(client, self.output, rollback, True, prompt)
        out = self.read_output(rollback)
        self.assertEqual(set(out), {key_id(1), key_id(5)})
        self.assertTrue(all(r["Outcome"] == "ENABLED" for r in out.values()))
        self.assertTrue(all(r["Mode"] == "enableKMS" for r in out.values()))
        self.assertEqual(client.calls, [("enable-key", arn(1)), ("enable-key", arn(5))])

    def test_enable_rejects_wrong_confirmation_and_bad_input(self):
        self.standard_report()
        self.run_disable(FakeClient(allow_writes=True), apply=True)
        client = FakeClient(allow_writes=True)
        with self.assertRaisesRegex(ValueError, "Conferma"):
            v.run_enable(client, self.output, self.dir / "r.csv", True,
                         mock.Mock(return_value="no"))
        self.assertEqual(client.calls, [])
        with self.assertRaisesRegex(ValueError, "esito di disableKMS"):
            v.run_enable(client, self.report, self.dir / "r2.csv", False)

    def test_cli_argument_rules(self):
        base = ["manage_kms_keys.py", "--input", "x.csv", "--profile", "p"]
        for extra in (
            ["--mode", "disableKMS"],
            ["--mode", "enableKMS", "--microservice", "pn-a"],
            ["--apply"],
            ["--mode", "disableKMS", "--microservice", "pn-a", "--min-age-days", "-1"],
            ["--mode", "deleteKMS", "--microservice", "pn-a"],
            ["--mode", "deleteKMS", "--pending-days", "6"],
            ["--mode", "deleteKMS", "--pending-days", "31"],
        ):
            with mock.patch("sys.argv", base + extra), \
                    mock.patch("logging.basicConfig"), mock.patch("sys.stderr"), \
                    self.assertRaises(SystemExit):
                v.main()

    def test_cli_dry_run_end_to_end(self):
        self.standard_report()
        argv = ["x", "--mode", "disableKMS", "--input", str(self.report),
                "--profile", "p", "--microservice", "pn-a", "--output", str(self.output)]
        client = FakeClient()
        with mock.patch("sys.argv", argv), mock.patch("logging.basicConfig"), \
                mock.patch.object(v, "AwsClient", return_value=client) as factory:
            self.assertEqual(v.main(), 0)
        self.assertEqual(client.calls, [])
        self.assertEqual(factory.call_args.kwargs["extra_operations"], set())
        self.assertEqual(self.read_output()[key_id(1)]["Outcome"], "DISABLE_CANDIDATE")

    def test_cli_existing_output_not_overwritten(self):
        self.write_report([report_row(1, "pn-a")])
        self.output.write_text("keep", encoding="utf-8")
        argv = ["x", "--mode", "disableKMS", "--input", str(self.report),
                "--profile", "p", "--microservice", "pn-a", "--output", str(self.output)]
        logging.disable(logging.NOTSET)
        self.addCleanup(logging.disable, logging.CRITICAL)
        with mock.patch("sys.argv", argv), mock.patch("logging.basicConfig"), \
                self.assertLogs(v.LOGGER, "ERROR"):
            self.assertEqual(v.main(), 1)
        self.assertEqual(self.output.read_text(encoding="utf-8"), "keep")


    def disabled_actions(self):
        self.standard_report()
        self.run_disable(FakeClient(allow_writes=True), apply=True)
        return self.output

    def test_delete_dry_run_checks_state_and_never_writes(self):
        actions = self.disabled_actions()
        client = FakeClient(states={arn(5): "Enabled"})
        prompt = mock.Mock(return_value="pn-a")
        out_path = self.dir / "delete.csv"
        rows = v.run_delete(client, actions, out_path, False, prompt=prompt)
        self.assertEqual(len(rows), 2)
        self.assertEqual(client.calls, [("describe-key", arn(1)), ("describe-key", arn(5))])
        out = self.read_output(out_path)
        self.assertEqual(out[key_id(1)]["Outcome"], "DELETE_CANDIDATE")
        self.assertEqual(out[key_id(5)]["Outcome"], "SKIPPED")
        self.assertIn("KeyState=Enabled", out[key_id(5)]["Reason"])
        prompt.assert_not_called()

    def test_delete_apply_schedules_only_disabled_keys(self):
        actions = self.disabled_actions()
        client = FakeClient(allow_writes=True, states={arn(5): "Enabled"})
        out_path = self.dir / "delete.csv"
        v.run_delete(client, actions, out_path, True, pending_days=7,
                     prompt=mock.Mock(return_value="pn-a"))
        self.assertEqual(client.calls, [
            ("describe-key", arn(1)), ("describe-key", arn(5)),
            ("describe-key", arn(1)), ("schedule-key-deletion", arn(1)),
        ])
        self.assertEqual(client.last_request["PendingWindowInDays"], 7)
        out = self.read_output(out_path)
        self.assertEqual(out[key_id(1)]["Outcome"], "DELETION_SCHEDULED")
        self.assertEqual(out[key_id(1)]["Applied"], "true")
        self.assertIn("2026-11-22", out[key_id(1)]["Reason"])
        self.assertEqual(out[key_id(5)]["Applied"], "false")

    def test_delete_rechecks_state_just_before_scheduling(self):
        actions = self.disabled_actions()
        client = FakeClient(allow_writes=True, states={arn(1): ["Disabled", "Enabled"]})
        out_path = self.dir / "delete.csv"
        v.run_delete(client, actions, out_path, True, prompt=mock.Mock(return_value="pn-a"))
        self.assertNotIn(("schedule-key-deletion", arn(1)), client.calls)
        self.assertIn(("schedule-key-deletion", arn(5)), client.calls)
        out = self.read_output(out_path)
        self.assertEqual(out[key_id(1)]["Outcome"], "SKIPPED")
        self.assertEqual(out[key_id(5)]["Outcome"], "DELETION_SCHEDULED")

    def test_delete_skips_non_customer_keys_and_reports_describe_errors(self):
        actions = self.disabled_actions()
        client = FakeClient(allow_writes=True, states={arn(5): "FAIL"},
                            managers={arn(1): "AWS"})
        out_path = self.dir / "delete.csv"
        rows = v.run_delete(client, actions, out_path, True,
                            prompt=mock.Mock(return_value="pn-a"))
        self.assertFalse(any(op == "schedule-key-deletion" for op, _ in client.calls))
        out = self.read_output(out_path)
        self.assertEqual(out[key_id(1)]["Outcome"], "SKIPPED")
        self.assertEqual(out[key_id(5)]["Outcome"], "ERROR")
        self.assertTrue(any(r["Outcome"] == "ERROR" for r in rows))

    def test_delete_requires_confirmation_and_disable_output(self):
        actions = self.disabled_actions()
        client = FakeClient(allow_writes=True)
        with self.assertRaisesRegex(ValueError, "Conferma"):
            v.run_delete(client, actions, self.dir / "d.csv", True,
                         prompt=mock.Mock(return_value="no"))
        self.assertFalse(any(op == "schedule-key-deletion" for op, _ in client.calls))
        with self.assertRaisesRegex(ValueError, "esito di disableKMS"):
            v.run_delete(client, self.report, self.dir / "d2.csv", False)

    def test_cancel_delete_rollback(self):
        actions = self.disabled_actions()
        deleted = self.dir / "delete.csv"
        v.run_delete(FakeClient(allow_writes=True), actions, deleted, True,
                     prompt=mock.Mock(return_value="pn-a"))
        client = FakeClient(allow_writes=True)
        with self.assertRaisesRegex(ValueError, "esito di deleteKMS|esiti di deleteKMS"):
            v.run_cancel_delete(client, actions, self.dir / "c0.csv", False)
        cancelled = self.dir / "cancel.csv"
        v.run_cancel_delete(client, deleted, cancelled, True,
                            prompt=mock.Mock(return_value="pn-a"))
        self.assertEqual(client.calls, [
            ("cancel-key-deletion", arn(1)), ("cancel-key-deletion", arn(5)),
        ])
        out = self.read_output(cancelled)
        self.assertTrue(all(r["Outcome"] == "DELETION_CANCELLED" for r in out.values()))
        self.assertTrue(all(r["Mode"] == "cancelDeleteKMS" for r in out.values()))


if __name__ == "__main__":
    unittest.main()
