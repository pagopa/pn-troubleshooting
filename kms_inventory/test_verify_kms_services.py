import csv
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import manage_kms_keys as v
from test_verify_kms_associations import ACCOUNT, IDENTITY, KEY_ID, KEY_ARN, OTHER_ARN
from test_verify_kms_ec2_ses import EMPTY_NEW_RESOURCES


class ServiceScannerTests(unittest.TestCase):
    def setUp(self):
        self.client = Mock(region="eu-south-1")
        self.client.call.side_effect = AssertionError("Chiamata non simulata")
        self.scanner = v.ResourceScanner(
            self.client, {KEY_ARN, OTHER_ARN}, ACCOUNT, "aws"
        )

    def responses(self, *responses):
        self.client.call.side_effect = list(responses)

    def associations(self):
        return self.scanner.result.associations[KEY_ARN]

    def test_arn_and_id_resolve_without_api_and_do_not_cross_scope(self):
        for reference in (KEY_ID, KEY_ARN):
            self.assertEqual(self.scanner.resolve_key(reference), KEY_ARN)
        other = KEY_ARN.replace(ACCOUNT, "111111111111")
        self.scanner.link(other, "Test", "test", "arn:test", "Key")
        self.assertFalse(self.scanner.result.associations)
        self.client.call.assert_not_called()

    def test_alias_resolution_pagination_and_cache(self):
        self.responses(
            {"Aliases": [{"AliasName": "alias/unbound"}],
             "Truncated": True, "NextMarker": "page2"},
            {"Aliases": [{"AliasName": "alias/test", "TargetKeyId": KEY_ID}]},
        )
        alias_arn = f"arn:aws:kms:eu-south-1:{ACCOUNT}:alias/test"
        for reference in ("alias/test", alias_arn, "alias/test"):
            self.assertEqual(self.scanner.resolve_key(reference), KEY_ARN)
        self.assertEqual(self.client.call.call_count, 2)
        payload = json.loads(self.client.call.call_args.args[-1])
        self.assertEqual(payload["Marker"], "page2")
        self.assertTrue(all(
            call.args[:2] == ("kms", "list-aliases")
            for call in self.client.call.call_args_list
        ))

    def test_unresolved_alias_and_malformed_reference_are_errors(self):
        self.responses({"Aliases": []})
        for reference in ("alias/missing", "", None, 12, "bad"):
            with self.subTest(reference=reference):
                with self.assertRaises(v.ScanError):
                    self.scanner.resolve_key(reference)

    def test_failed_alias_lookup_is_cached_without_guessing_target(self):
        self.responses(v.ScanError("AccessDenied"))
        for _ in range(2):
            with self.assertRaisesRegex(v.ScanError, "AccessDenied"):
                self.scanner.resolve_key("alias/test")
        self.assertEqual(self.client.call.call_count, 1)
        self.assertEqual(self.scanner.resolve_key(KEY_ID), KEY_ARN)

    def test_truncated_alias_listing_without_marker_is_rejected(self):
        self.responses({"Aliases": [], "Truncated": True})
        with self.assertRaisesRegex(v.ScanError, "senza marker"):
            self.scanner.resolve_key("alias/test")

    def test_external_alias_is_not_resolved_in_current_account(self):
        reference = "arn:aws:kms:eu-west-1:111111111111:alias/test"
        self.scanner.link(reference, "Test", "name", "arn:test", "key")
        self.assertFalse(self.scanner.result.associations)
        self.client.call.assert_not_called()

    def test_kinesis_matches_id_and_follows_legacy_page_cursor(self):
        self.responses(
            {"StreamNames": ["stream"], "HasMoreStreams": True},
            {"StreamDescriptionSummary": {
                "EncryptionType": "KMS", "KeyId": KEY_ID, "StreamARN": "arn:stream"
            }},
            {"StreamNames": ["plain"], "HasMoreStreams": False},
            {"StreamDescriptionSummary": {"EncryptionType": "NONE"}},
        )
        self.scanner.scan_kinesis()
        association = next(iter(self.associations()))
        self.assertEqual(association.resource_type, "AWS::Kinesis::Stream")
        self.assertEqual(association.key_reference, KEY_ID)
        payload = json.loads(self.client.call.call_args_list[2].args[-1])
        self.assertEqual(payload["ExclusiveStartStreamName"], "stream")

    def test_kinesis_next_token_and_missing_cursor(self):
        self.responses(
            {"StreamNames": [], "HasMoreStreams": True, "NextToken": "next"},
            {"StreamNames": [], "HasMoreStreams": False},
        )
        self.scanner.scan_kinesis()
        self.assertEqual(
            json.loads(self.client.call.call_args.args[-1])["NextToken"], "next"
        )
        self.responses({"StreamNames": [], "HasMoreStreams": True})
        with self.assertRaises(v.ScanError):
            self.scanner.scan_kinesis()

    def test_kinesis_switching_cursors_does_not_send_conflicting_parameters(self):
        self.responses(
            {"StreamNames": ["a"], "HasMoreStreams": True},
            {"StreamDescriptionSummary": {"EncryptionType": "NONE"}},
            {"StreamNames": ["b"], "HasMoreStreams": True, "NextToken": "next"},
            {"StreamDescriptionSummary": {"EncryptionType": "NONE"}},
            {"StreamNames": [], "HasMoreStreams": False},
        )
        self.scanner.scan_kinesis()
        payload = json.loads(self.client.call.call_args.args[-1])
        self.assertEqual(payload["NextToken"], "next")
        self.assertNotIn("ExclusiveStartStreamName", payload)

    def test_s3_filters_region_and_preserves_original_alias(self):
        self.responses(
            {"Buckets": [{"Name": "foreign"}, {"Name": "local"}]},
            {"LocationConstraint": "eu-west-1"},
            {"LocationConstraint": "eu-south-1"},
            {"ServerSideEncryptionConfiguration": {"Rules": [{
                "ApplyServerSideEncryptionByDefault": {
                    "SSEAlgorithm": "aws:kms:dsse", "KMSMasterKeyID": "alias/test"
                }
            }]}},
            {"Aliases": [{"AliasName": "alias/test", "TargetKeyId": KEY_ID}]},
        )
        self.scanner.scan_s3()
        association = next(iter(self.associations()))
        self.assertEqual(association.resource_name, "local")
        self.assertEqual(association.key_reference, "alias/test")
        self.assertEqual(association.resource_arn, "arn:aws:s3:::local")
        calls = self.client.call.call_args_list
        self.assertEqual(sum(call.args[:2] == ("s3api", "get-bucket-encryption") for call in calls), 1)
        self.assertIn("--expected-bucket-owner", calls[1].args)

    def test_s3_default_aws_key_and_global_pagination(self):
        self.responses(
            {"Buckets": [{"Name": "local"}], "ContinuationToken": "next"},
            {"LocationConstraint": "eu-south-1"},
            {"ServerSideEncryptionConfiguration": {"Rules": [{
                "ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "aws:kms"}
            }]}},
            {"Aliases": [{"AliasName": "alias/aws/s3", "TargetKeyId": KEY_ID}]},
            {"Buckets": []},
        )
        self.scanner.scan_s3()
        self.assertEqual(next(iter(self.associations())).key_reference, "alias/aws/s3")
        self.assertEqual(
            json.loads(self.client.call.call_args.args[-1])["ContinuationToken"], "next"
        )

    def test_s3_sse_s3_and_missing_configuration_are_not_errors(self):
        for response in (
            {"ServerSideEncryptionConfiguration": {"Rules": [{
                "ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}
            }]}},
            v.ScanError("ServerSideEncryptionConfigurationNotFoundError"),
        ):
            with self.subTest(response=response):
                self.responses(
                    {"Buckets": [{"Name": "local"}]},
                    {"LocationConstraint": "eu-south-1"}, response,
                )
                self.scanner.scan_s3()
                self.assertFalse(self.scanner.result.errors)
                self.assertFalse(self.associations())

    def test_s3_access_denied_and_missing_region_are_incomplete(self):
        for response in ({}, v.ScanError("AccessDenied")):
            with self.subTest(response=response):
                self.responses({"Buckets": [{"Name": "local"}]}, response)
                with self.assertLogs(v.LOGGER, level="ERROR"):
                    self.scanner.scan_s3()
                self.assertEqual(self.scanner.result.status(KEY_ARN), "SCAN_INCOMPLETE")

    def test_dynamodb_key_and_table_pagination(self):
        self.responses(
            {"TableNames": ["encrypted"], "LastEvaluatedTableName": "encrypted"},
            {"Table": {"TableArn": "arn:table", "SSEDescription": {
                "KMSMasterKeyArn": KEY_ARN
            }}},
            {"TableNames": ["default"]},
            {"Table": {"TableArn": "arn:default"}},
        )
        self.scanner.scan_dynamodb()
        self.assertEqual(next(iter(self.associations())).property_name, "SSEDescription.KMSMasterKeyArn")
        self.assertEqual(
            json.loads(self.client.call.call_args_list[2].args[-1])["ExclusiveStartTableName"],
            "encrypted",
        )

    def test_sqs_and_sns_resolve_shared_alias_once(self):
        self.responses(
            {"QueueUrls": ["https://sqs/queue"], "NextToken": "p2"},
            {"Attributes": {"QueueArn": "arn:queue", "KmsMasterKeyId": "alias/test"}},
            {"Aliases": [{"AliasName": "alias/test", "TargetKeyId": KEY_ID}]},
            {},
            {"Topics": [{"TopicArn": "arn:topic"}]},
            {"Attributes": {"KmsMasterKeyId": "alias/test"}},
        )
        self.scanner.scan_sqs()
        self.scanner.scan_sns()
        self.assertEqual(
            {item.resource_type for item in self.associations()},
            {"AWS::SQS::Queue", "AWS::SNS::Topic"},
        )
        self.assertEqual(sum(
            call.args[:2] == ("kms", "list-aliases")
            for call in self.client.call.call_args_list
        ), 1)
        requests = [
            json.loads(call.args[-1]) for call in self.client.call.call_args_list
            if call.args[:2] == ("sqs", "list-queues")
        ]
        self.assertEqual(requests[-1]["NextToken"], "p2")

    def test_unencrypted_sqs_and_sns_are_ignored(self):
        for attributes in ({}, {"KmsMasterKeyId": ""}):
            with self.subTest(attributes=attributes):
                self.responses(
                    {"QueueUrls": ["url"]},
                    {"Attributes": {"QueueArn": "arn:queue", **attributes}},
                    {"Topics": [{"TopicArn": "arn:topic"}]}, {"Attributes": attributes},
                )
                self.scanner.scan_sqs()
                self.scanner.scan_sns()
                self.assertFalse(self.scanner.result.associations)
                self.assertFalse(self.scanner.result.errors)

    def test_rds_instances_clusters_snapshots_and_extra_keys(self):
        specs = (
            ("DBInstances", "DBInstance", "StorageEncrypted"),
            ("DBClusters", "DBCluster", "StorageEncrypted"),
            ("DBSnapshots", "DBSnapshot", "Encrypted"),
            ("DBClusterSnapshots", "DBClusterSnapshot", "StorageEncrypted"),
        )
        responses = []
        for collection, kind, encrypted_field in specs:
            resource = {
                f"{kind}Identifier": "resource", f"{kind}Arn": f"arn:{kind}",
                encrypted_field: True, "KmsKeyId": KEY_ARN,
            }
            if kind == "DBInstance":
                resource.update({
                    "PerformanceInsightsKMSKeyId": OTHER_ARN,
                    "ActivityStreamKmsKeyId": KEY_ARN,
                    "MasterUserSecret": {"KmsKeyId": KEY_ARN},
                })
            responses.append({collection: [resource]})
        self.responses(*responses)
        self.scanner.scan_rds()
        self.assertEqual(len(self.associations()), 6)
        self.assertEqual(len(self.scanner.result.associations[OTHER_ARN]), 1)
        self.assertEqual(
            {item.resource_type for item in self.associations()},
            {f"AWS::RDS::{kind}" for _, kind, _ in specs},
        )

    def test_rds_failure_continues_other_resource_kinds_and_paginates(self):
        self.responses(
            v.ScanError("AccessDenied"),
            {"DBClusters": [], "Marker": "p2"}, {"DBClusters": []},
            {"DBSnapshots": []}, {"DBClusterSnapshots": []},
        )
        with self.assertLogs(v.LOGGER, level="ERROR"):
            self.scanner.scan_rds()
        self.assertEqual(len(self.scanner.result.errors), 1)
        self.assertEqual(self.client.call.call_count, 5)
        self.assertEqual(
            json.loads(self.client.call.call_args_list[2].args[-1])["Marker"], "p2"
        )

    def test_secrets_include_pending_deletion_default_key_and_pages(self):
        self.responses(
            {"SecretList": [{"Name": "custom", "ARN": "arn:secret1", "KmsKeyId": KEY_ARN}],
             "NextToken": "p2"},
            {"SecretList": [{"Name": "default", "ARN": "arn:secret2"}]},
            {"Aliases": [{"AliasName": "alias/aws/secretsmanager", "TargetKeyId": KEY_ID}]},
        )
        self.scanner.scan_secrets()
        self.assertEqual(len(self.associations()), 2)
        payload = json.loads(self.client.call.call_args_list[0].args[-1])
        self.assertTrue(payload["IncludePlannedDeletion"])
        self.assertTrue(all(
            call.args[1] != "get-secret-value" for call in self.client.call.call_args_list
        ))

    def test_details_failures_keep_other_resources_and_clean_negatives_are_blocked(self):
        self.responses(
            {"TableNames": ["denied", "good"]},
            v.ScanError("AccessDenied"),
            {"Table": {"TableArn": "arn:table", "SSEDescription": {
                "KMSMasterKeyArn": KEY_ARN
            }}},
        )
        with self.assertLogs(v.LOGGER, level="ERROR"):
            self.scanner.scan_dynamodb()
        self.assertEqual(self.scanner.result.status(KEY_ARN), "ASSOCIATED")
        self.assertEqual(self.scanner.result.status(OTHER_ARN), "SCAN_INCOMPLETE")
        self.assertIn("denied", self.scanner.result.errors[0])

    def test_secret_error_does_not_log_description_or_tags(self):
        self.responses({"SecretList": [{
            "Name": "broken", "ARN": "arn:secret", "KmsKeyId": [],
            "Description": "sensitive-description",
            "Tags": [{"Key": "internal", "Value": "sensitive-tag"}],
        }]})
        with self.assertLogs(v.LOGGER, level="ERROR") as logs:
            self.scanner.scan_secrets()
        self.assertIn("broken", logs.output[0])
        self.assertNotIn("sensitive", logs.output[0])
        self.assertTrue(self.scanner.result.errors)

    def test_malformed_collections_details_and_repeated_tokens_fail_explicitly(self):
        for response in ({}, {"TableNames": None}):
            self.responses(response)
            with self.assertRaises(v.ScanError):
                self.scanner.scan_dynamodb()
        self.responses({"QueueUrls": ["url"]}, {})
        with self.assertLogs(v.LOGGER, level="ERROR"):
            self.scanner.scan_sqs()
        self.assertTrue(self.scanner.result.errors)
        self.responses(
            {"Topics": [], "NextToken": "same"}, {"Topics": [], "NextToken": "same"}
        )
        with self.assertRaises(v.ScanError):
            self.scanner.scan_sns()

    def test_all_services_continue_after_denials(self):
        self.client.call.side_effect = v.ScanError("AccessDenied")
        with self.assertLogs(v.LOGGER, level="ERROR"):
            result = self.scanner.scan()
        self.assertEqual(result.status(KEY_ARN), "SCAN_INCOMPLETE")
        self.assertEqual(len(result.errors), 43)

    def test_end_to_end_all_services_and_reports(self):
        empty = {
            ("sts", "get-caller-identity"): IDENTITY,
            ("logs", "describe-log-groups"): {"logGroups": []},
            ("kinesis", "list-streams"): {"StreamNames": []},
            ("s3api", "list-buckets"): {"Buckets": []},
            ("dynamodb", "list-tables"): {"TableNames": []},
            ("sqs", "list-queues"): {},
            ("sns", "list-topics"): {"Topics": []},
            ("rds", "describe-db-instances"): {"DBInstances": []},
            ("rds", "describe-db-clusters"): {"DBClusters": []},
            ("rds", "describe-db-snapshots"): {"DBSnapshots": []},
            ("rds", "describe-db-cluster-snapshots"): {"DBClusterSnapshots": []},
            ("secretsmanager", "list-secrets"): {"SecretList": [
                {"Name": "test", "ARN": "arn:secret", "KmsKeyId": KEY_ARN}
            ]},
            ("elasticache", "describe-serverless-caches"): {"ServerlessCaches": []},
            ("opensearch", "list-domain-names"): {"DomainNames": []},
            ("efs", "describe-file-systems"): {"FileSystems": []},
            ("backup", "list-backup-vaults"): {"BackupVaultList": []},
            ("firehose", "list-delivery-streams"): {
                "DeliveryStreamNames": [], "HasMoreDeliveryStreams": False,
            },
            ("athena", "list-work-groups"): {"WorkGroups": []},
            ("lambda", "list-functions"): {"Functions": []},
            ("codebuild", "list-projects"): {"projects": []},
            ("events", "list-event-buses"): {"EventBuses": []},
            ("cloudtrail", "list-trails"): {"Trails": []},
            **EMPTY_NEW_RESOURCES,
        }

        def cli(command, **kwargs):
            operation = tuple(command[1:3])
            self.assertIn(operation, v.AwsClient.ALLOWED_OPERATIONS)
            self.assertTrue(command[2].startswith(("get-", "list-", "describe-")))
            if isinstance(empty[operation], str):
                return subprocess.CompletedProcess(command, 1, "", empty[operation])
            return subprocess.CompletedProcess(command, 0, json.dumps(empty[operation]), "")

        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "input.csv", Path(directory) / "report.csv"
            with source.open("w", newline="") as stream:
                writer = csv.writer(stream)
                writer.writerow(v.INPUT_FIELDS)
                writer.writerow([KEY_ID, "", "Microservice=test", "", ""])
                writer.writerow([OTHER_ARN.rsplit("/", 1)[-1], "", "Microservice=test", "", ""])
            args = [
                "manage_kms_keys.py", "--input", str(source),
                "--output", str(output), "--profile", "test",
            ]
            with patch.object(v.sys, "argv", args):
                with patch.object(v.subprocess, "run", side_effect=cli) as runner:
                    with patch.object(v.logging, "basicConfig"):
                        self.assertEqual(v.main(), 0)
            self.assertEqual(runner.call_count, len(empty))
            with output.open(encoding="utf-8-sig", newline="") as stream:
                row = next(csv.DictReader(stream))
            self.assertEqual(row["Status"], "ASSOCIATED")
            self.assertEqual(row["ResourceType"], "AWS::SecretsManager::Secret")
            self.assertEqual(row["ScanComplete"], "true")
            self.assertEqual(row["CheckedServices"], "; ".join(v.CHECKED_SERVICES))
            empty[("dynamodb", "list-tables")] = "AccessDenied"
            with patch.object(v.sys, "argv", args):
                with patch.object(v.subprocess, "run", side_effect=cli):
                    with patch.object(v.logging, "basicConfig"):
                        with self.assertLogs(v.LOGGER, level="ERROR"):
                            self.assertEqual(v.main(), 2)
            with output.open(encoding="utf-8-sig", newline="") as stream:
                rows = {row["KeyArn"]: row for row in csv.DictReader(stream)}
            self.assertEqual(rows[KEY_ARN]["Status"], "ASSOCIATED")
            self.assertEqual(rows[OTHER_ARN]["Status"], "SCAN_INCOMPLETE")
            self.assertTrue(all(row["ScanComplete"] == "false" for row in rows.values()))
            self.assertTrue(all("AccessDenied" in row["ScanErrors"] for row in rows.values()))
            with output.with_name("report_summary.csv").open(
                encoding="utf-8-sig", newline=""
            ) as stream:
                summary = next(csv.DictReader(stream))
            self.assertEqual(summary["TotalKeys"], "2")
            self.assertEqual(summary["AssociatedKeys"], "1")
            self.assertEqual(summary["ScanIncompleteKeys"], "1")
            self.assertEqual(summary["NoAssociationFoundKeys"], "0")


if __name__ == "__main__":
    unittest.main()
