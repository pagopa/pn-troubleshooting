import json
import unittest
from unittest.mock import Mock

import manage_kms_keys as v
from test_verify_kms_associations import ACCOUNT, KEY_ID, KEY_ARN, OTHER_ARN
from test_verify_kms_ec2_ses import EMPTY_NEW_RESOURCES


class AdditionalServiceTests(unittest.TestCase):
    def setUp(self):
        self.client = Mock(region="eu-south-1")
        self.client.call.side_effect = AssertionError("Chiamata non simulata")
        self.scanner = v.ResourceScanner(
            self.client, {KEY_ARN, OTHER_ARN}, ACCOUNT, "aws"
        )

    def responses(self, *responses):
        self.client.call.side_effect = list(responses)

    def matches(self, arn=KEY_ARN):
        return self.scanner.result.associations[arn]

    def payload(self, index=-1):
        return json.loads(self.client.call.call_args_list[index].args[-1])

    def test_serverless_cache_pagination_and_id_resolution(self):
        self.responses(
            {"ServerlessCaches": [{
                "ServerlessCacheName": "cache", "ARN": "arn:cache", "KmsKeyId": KEY_ID,
            }], "NextToken": "p2"},
            {"ServerlessCaches": []},
        )
        self.scanner.scan_elasticache()
        match = next(iter(self.matches()))
        self.assertEqual(match.resource_type, "AWS::ElastiCache::ServerlessCache")
        self.assertEqual(match.key_reference, KEY_ID)
        self.assertEqual(self.payload()["NextToken"], "p2")

    def test_opensearch_encryption_and_unencrypted_domain(self):
        self.responses(
            {"DomainNames": [{"DomainName": "encrypted"}, {"DomainName": "plain"}]},
            {"DomainStatus": {
                "ARN": "arn:domain", "EncryptionAtRestOptions": {
                    "Enabled": True, "KmsKeyId": KEY_ARN,
                },
            }},
            {"DomainStatus": {"EncryptionAtRestOptions": {"Enabled": False}}},
        )
        self.scanner.scan_opensearch()
        self.assertEqual(len(self.matches()), 1)
        self.assertEqual(
            next(iter(self.matches())).property_name, "EncryptionAtRestOptions.KmsKeyId"
        )

    def test_opensearch_detail_failure_keeps_next_domain(self):
        self.responses(
            {"DomainNames": [{"DomainName": "denied"}, {"DomainName": "good"}]},
            v.ScanError("AccessDenied"),
            {"DomainStatus": {"ARN": "arn:domain", "EncryptionAtRestOptions": {
                "Enabled": True, "KmsKeyId": KEY_ARN,
            }}},
        )
        with self.assertLogs(v.LOGGER, level="ERROR"):
            self.scanner.scan_opensearch()
        self.assertEqual(self.scanner.result.status(KEY_ARN), "ASSOCIATED")
        self.assertEqual(self.scanner.result.status(OTHER_ARN), "SCAN_INCOMPLETE")

    def test_efs_markers_and_unencrypted_filesystem(self):
        self.responses(
            {"FileSystems": [{
                "FileSystemId": "fs-1", "FileSystemArn": "arn:fs",
                "Encrypted": True, "KmsKeyId": KEY_ARN,
            }], "NextMarker": "p2"},
            {"FileSystems": [{"Encrypted": False}]},
        )
        self.scanner.scan_efs()
        self.assertEqual(next(iter(self.matches())).resource_type, "AWS::EFS::FileSystem")
        self.assertEqual(self.payload()["Marker"], "p2")

    def test_backup_vault_and_recovery_points_use_independent_keys_and_pages(self):
        self.responses(
            {"BackupVaultList": [{
                "BackupVaultName": "vault", "BackupVaultArn": "arn:vault",
                "EncryptionKeyArn": KEY_ARN,
            }], "NextToken": "vault-page2"},
            {"RecoveryPoints": [{
                "RecoveryPointArn": "arn:recovery", "IsEncrypted": True,
                "EncryptionKeyArn": OTHER_ARN,
            }], "NextToken": "point-page2"},
            {"RecoveryPoints": [{"RecoveryPointArn": "arn:plain", "IsEncrypted": False}]},
            {"BackupVaultList": []},
        )
        self.scanner.scan_backup()
        self.assertEqual(
            next(iter(self.matches())).resource_type, "AWS::Backup::BackupVault"
        )
        self.assertEqual(
            next(iter(self.matches(OTHER_ARN))).resource_type, "AWS::Backup::RecoveryPoint"
        )
        self.assertEqual(self.payload(2)["NextToken"], "point-page2")
        self.assertEqual(self.payload(2)["BackupVaultName"], "vault")
        self.assertEqual(self.payload(3)["NextToken"], "vault-page2")

    def test_backup_invalid_vault_key_does_not_skip_recovery_points(self):
        self.responses(
            {"BackupVaultList": [{"BackupVaultName": "vault", "BackupVaultArn": "arn:vault"}]},
            {"RecoveryPoints": [{
                "RecoveryPointArn": "arn:point", "IsEncrypted": True,
                "EncryptionKeyArn": KEY_ARN,
            }]},
        )
        with self.assertLogs(v.LOGGER, level="ERROR"):
            self.scanner.scan_backup()
        self.assertEqual(self.scanner.result.status(KEY_ARN), "ASSOCIATED")
        self.assertEqual(self.scanner.result.status(OTHER_ARN), "SCAN_INCOMPLETE")

    def test_backup_recovery_access_denied_continues_next_vault(self):
        vaults = [
            {"BackupVaultName": name, "BackupVaultArn": f"arn:{name}", "EncryptionKeyArn": KEY_ARN}
            for name in ("a", "b")
        ]
        self.responses(
            {"BackupVaultList": vaults}, v.ScanError("AccessDenied"),
            {"RecoveryPoints": []},
        )
        with self.assertLogs(v.LOGGER, level="ERROR"):
            self.scanner.scan_backup()
        self.assertEqual(len(self.matches()), 2)
        self.assertEqual(self.payload()["BackupVaultName"], "b")

    def test_backup_aws_owned_keys_do_not_require_customer_key_arns(self):
        self.responses(
            {"BackupVaultList": [{
                "BackupVaultName": "owned", "BackupVaultArn": "arn:vault",
                "EncryptionKeyType": "AWS_OWNED_KMS_KEY",
            }]},
            {"RecoveryPoints": [{
                "RecoveryPointArn": "arn:owned", "IsEncrypted": True,
                "EncryptionKeyType": "AWS_OWNED_KMS_KEY",
            }]},
        )
        self.scanner.scan_backup()
        self.assertFalse(self.scanner.result.errors)
        self.assertFalse(self.scanner.result.associations)

    @staticmethod
    def firehose_stream(destinations, more=False):
        return {"DeliveryStreamDescription": {
            "DeliveryStreamARN": "arn:firehose",
            "DeliveryStreamEncryptionConfiguration": {
                "KeyType": "CUSTOMER_MANAGED_CMK", "KeyARN": KEY_ARN,
            },
            "Destinations": destinations, "HasMoreDestinations": more,
        }}

    def test_firehose_stream_destination_and_backup_destination_keys(self):
        destination = {
            "DestinationId": "d1", "ExtendedS3DestinationDescription": {
                "EncryptionConfiguration": {
                    "KMSEncryptionConfig": {"AWSKMSKeyARN": OTHER_ARN},
                },
                "S3BackupDescription": {"EncryptionConfiguration": {
                    "KMSEncryptionConfig": {"AWSKMSKeyARN": KEY_ARN},
                }},
            },
        }
        self.responses(
            {"DeliveryStreamNames": ["stream"], "HasMoreDeliveryStreams": True},
            self.firehose_stream([destination], more=True),
            self.firehose_stream([{"DestinationId": "d2"}]),
            {"DeliveryStreamNames": [], "HasMoreDeliveryStreams": False},
        )
        self.scanner.scan_firehose()
        self.assertEqual(len(self.matches()), 2)
        self.assertEqual(len(self.matches(OTHER_ARN)), 1)
        self.assertTrue(any("S3BackupDescription" in item.property_name for item in self.matches()))
        self.assertEqual(self.payload(2)["ExclusiveStartDestinationId"], "d1")
        self.assertEqual(self.payload(3)["ExclusiveStartDeliveryStreamName"], "stream")

    def test_firehose_repeated_destination_cursor_and_missing_stream_cursor(self):
        destination = {"DestinationId": "d1"}
        self.responses(
            {"DeliveryStreamNames": ["stream"], "HasMoreDeliveryStreams": False},
            self.firehose_stream([destination], True),
            self.firehose_stream([destination], True),
        )
        with self.assertLogs(v.LOGGER, level="ERROR"):
            self.scanner.scan_firehose()
        self.assertTrue(self.scanner.result.errors)
        self.responses({"DeliveryStreamNames": [], "HasMoreDeliveryStreams": True})
        with self.assertRaisesRegex(v.ScanError, "cursore"):
            self.scanner.scan_firehose()

    def test_firehose_customer_key_missing_is_error(self):
        detail = self.firehose_stream([])
        del detail["DeliveryStreamDescription"]["DeliveryStreamEncryptionConfiguration"]["KeyARN"]
        self.responses(
            {"DeliveryStreamNames": ["stream"], "HasMoreDeliveryStreams": False}, detail
        )
        with self.assertLogs(v.LOGGER, level="ERROR"):
            self.scanner.scan_firehose()
        self.assertIn("senza KeyARN", self.scanner.result.errors[0])

    def test_athena_all_encryption_configurations_and_pagination(self):
        self.responses(
            {"WorkGroups": [{"Name": "group"}], "NextToken": "p2"},
            {"WorkGroup": {"Configuration": {
                "ResultConfiguration": {"EncryptionConfiguration": {
                    "EncryptionOption": "SSE_KMS", "KmsKey": KEY_ARN,
                }},
                "ManagedQueryResultsConfiguration": {"EncryptionConfiguration": {
                    "KmsKey": OTHER_ARN,
                }},
                "CustomerContentEncryptionConfiguration": {"KmsKey": KEY_ID},
            }}},
            {"WorkGroups": []},
        )
        self.scanner.scan_athena()
        self.assertEqual(len(self.matches()), 2)
        self.assertEqual(len(self.matches(OTHER_ARN)), 1)
        self.assertEqual(self.payload()["NextToken"], "p2")
        self.assertEqual(
            next(iter(self.matches())).resource_arn,
            f"arn:aws:athena:eu-south-1:{ACCOUNT}:workgroup/group",
        )

    def test_athena_sse_s3_is_not_a_kms_association(self):
        self.responses(
            {"WorkGroups": [{"Name": "s3"}]},
            {"WorkGroup": {"Configuration": {"ResultConfiguration": {
                "EncryptionConfiguration": {"EncryptionOption": "SSE_S3"},
            }}}},
        )
        self.scanner.scan_athena()
        self.assertFalse(self.scanner.result.associations)
        self.assertFalse(self.scanner.result.errors)

    def test_athena_encrypted_results_without_key_are_incomplete(self):
        self.responses(
            {"WorkGroups": [{"Name": "bad"}]},
            {"WorkGroup": {"Configuration": {"ResultConfiguration": {
                "EncryptionConfiguration": {"EncryptionOption": "SSE_KMS"},
            }}}},
        )
        with self.assertLogs(v.LOGGER, level="ERROR"):
            self.scanner.scan_athena()
        self.assertEqual(self.scanner.result.status(KEY_ARN), "SCAN_INCOMPLETE")

    def test_lambda_versions_and_source_package_key_without_logging_secrets(self):
        arn = f"arn:aws:lambda:eu-south-1:{ACCOUNT}:function:test"
        self.responses(
            {"Functions": [{
                "FunctionName": "test", "FunctionArn": arn, "Version": "$LATEST",
                "KMSKeyArn": KEY_ARN, "Environment": {"Variables": {"secret": "dont-log"}},
            }], "NextMarker": "p2"},
            {"Configuration": {"KMSKeyArn": KEY_ARN}, "Code": {
                "SourceKMSKeyArn": OTHER_ARN, "Location": "https://sensitive-code-url",
            }},
            {"Functions": [{
                "FunctionName": "test", "FunctionArn": f"{arn}:1",
                "Version": "1", "KMSKeyArn": KEY_ARN,
            }]},
            {"Configuration": {"KMSKeyArn": KEY_ARN}, "Code": {}},
        )
        self.scanner.scan_lambda()
        self.assertEqual(len(self.matches()), 2)
        self.assertEqual(len(self.matches(OTHER_ARN)), 1)
        self.assertEqual(self.payload(0)["FunctionVersion"], "ALL")
        self.assertEqual(self.payload(2)["Marker"], "p2")
        self.assertEqual(self.client.call.call_args_list[1].args[-1], f"{arn}:$LATEST")
        self.assertEqual(self.client.call.call_args_list[3].args[-1], f"{arn}:1")
        self.assertEqual(
            next(iter(self.matches(OTHER_ARN))).property_name, "SourceKMSKeyArn"
        )

    def test_lambda_error_redacts_environment_and_preserves_known_association(self):
        self.responses(
            {"Functions": [{
                "FunctionName": "test", "FunctionArn": "arn:function",
                "Version": "$LATEST", "KMSKeyArn": KEY_ARN,
                "Environment": {"Variables": {"secret": "dont-log"}},
            }]},
            v.ScanError("AccessDenied"),
        )
        with self.assertLogs(v.LOGGER, level="ERROR") as logs:
            self.scanner.scan_lambda()
        self.assertNotIn("dont-log", "\n".join(logs.output))
        self.assertEqual(self.scanner.result.status(KEY_ARN), "ASSOCIATED")
        self.assertEqual(self.scanner.result.status(OTHER_ARN), "SCAN_INCOMPLETE")

    def test_codebuild_project_alias_and_lowercase_tokens(self):
        self.responses(
            {"projects": ["project"], "nextToken": "p2"},
            {"projects": [{"name": "project", "arn": "arn:project", "encryptionKey": "alias/test"}]},
            {"Aliases": [{"AliasName": "alias/test", "TargetKeyId": KEY_ID}]},
            {"projects": []},
        )
        self.scanner.scan_codebuild()
        self.assertEqual(next(iter(self.matches())).key_reference, "alias/test")
        self.assertEqual(self.payload()["nextToken"], "p2")

    def test_codebuild_not_found_is_incomplete(self):
        self.responses(
            {"projects": ["gone"]}, {"projects": [], "projectsNotFound": ["gone"]},
        )
        with self.assertLogs(v.LOGGER, level="ERROR"):
            self.scanner.scan_codebuild()
        self.assertEqual(self.scanner.result.status(KEY_ARN), "SCAN_INCOMPLETE")

    def test_eventbridge_bus_configuration_and_pagination(self):
        self.responses(
            {"EventBuses": [{"Name": "bus"}], "NextToken": "p2"},
            {"Arn": "arn:bus", "KmsKeyIdentifier": KEY_ID},
            {"EventBuses": [{"Name": "default"}]},
            {"Arn": "arn:default"},
        )
        self.scanner.scan_eventbridge()
        self.assertEqual(next(iter(self.matches())).resource_type, "AWS::Events::EventBus")
        self.assertEqual(self.payload(2)["NextToken"], "p2")
        self.assertFalse(self.scanner.result.errors)

    def test_cloudtrail_home_region_pagination_and_trail_key(self):
        self.responses(
            {"Trails": [
                {"HomeRegion": "eu-west-1", "TrailARN": "arn:foreign"},
                {"HomeRegion": "eu-south-1", "TrailARN": "arn:trail"},
            ], "NextToken": "p2"},
            {"Trail": {"Name": "trail", "KmsKeyId": KEY_ARN}},
            {"Trails": []},
        )
        self.scanner.scan_cloudtrail()
        self.assertEqual(next(iter(self.matches())).resource_type, "AWS::CloudTrail::Trail")
        self.assertEqual(self.client.call.call_count, 3)
        self.assertEqual(self.client.call.call_args_list[1].args[-1], "arn:trail")
        self.assertEqual(self.payload()["NextToken"], "p2")

    def test_new_scanners_reject_missing_collections(self):
        for method in (
            "scan_elasticache", "scan_opensearch", "scan_efs", "scan_backup",
            "scan_firehose", "scan_athena", "scan_lambda", "scan_codebuild",
            "scan_eventbridge", "scan_cloudtrail",
        ):
            with self.subTest(method=method):
                self.responses({})
                with self.assertRaises(v.ScanError):
                    getattr(self.scanner, method)()

    def test_new_scanners_reject_malformed_details_without_clean_negatives(self):
        for method, responses in (
            ("scan_elasticache", [{"ServerlessCaches": [{"ServerlessCacheName": "bad"}]}]),
            ("scan_efs", [{"FileSystems": [{"Encrypted": True}]}]),
            ("scan_opensearch", [{"DomainNames": [{"DomainName": "bad"}]}, {}]),
            ("scan_athena", [{"WorkGroups": [{"Name": "bad"}]}, {}]),
            ("scan_eventbridge", [{"EventBuses": [{"Name": "bad"}]}, {}]),
            ("scan_cloudtrail", [{"Trails": [{"HomeRegion": "eu-south-1"}]}]),
        ):
            with self.subTest(method=method):
                self.responses(*responses)
                with self.assertLogs(v.LOGGER, level="ERROR"):
                    getattr(self.scanner, method)()
                self.assertEqual(self.scanner.result.status(OTHER_ARN), "SCAN_INCOMPLETE")

    def test_combined_scans_keep_all_new_resource_types(self):
        responses = {
            ("kinesis", "list-streams"): {"StreamNames": []},
            ("s3api", "list-buckets"): {"Buckets": []},
            ("dynamodb", "list-tables"): {"TableNames": []},
            ("sqs", "list-queues"): {},
            ("sns", "list-topics"): {"Topics": []},
            ("rds", "describe-db-instances"): {"DBInstances": []},
            ("rds", "describe-db-clusters"): {"DBClusters": []},
            ("rds", "describe-db-snapshots"): {"DBSnapshots": []},
            ("rds", "describe-db-cluster-snapshots"): {"DBClusterSnapshots": []},
            ("secretsmanager", "list-secrets"): {"SecretList": []},
            ("elasticache", "describe-serverless-caches"): {"ServerlessCaches": [{
                "ServerlessCacheName": "cache", "ARN": "arn:cache", "KmsKeyId": KEY_ARN,
            }]},
            ("opensearch", "list-domain-names"): {"DomainNames": [{"DomainName": "domain"}]},
            ("opensearch", "describe-domain"): {"DomainStatus": {
                "ARN": "arn:domain", "EncryptionAtRestOptions": {
                    "Enabled": True, "KmsKeyId": KEY_ARN,
                },
            }},
            ("efs", "describe-file-systems"): {"FileSystems": [{
                "FileSystemId": "fs", "FileSystemArn": "arn:fs",
                "Encrypted": True, "KmsKeyId": KEY_ARN,
            }]},
            ("backup", "list-backup-vaults"): {"BackupVaultList": [{
                "BackupVaultName": "vault", "BackupVaultArn": "arn:vault",
                "EncryptionKeyArn": KEY_ARN,
            }]},
            ("backup", "list-recovery-points-by-backup-vault"): {"RecoveryPoints": [{
                "RecoveryPointArn": "arn:point", "IsEncrypted": True,
                "EncryptionKeyArn": KEY_ARN,
            }]},
            ("firehose", "list-delivery-streams"): {
                "DeliveryStreamNames": ["stream"], "HasMoreDeliveryStreams": False,
            },
            ("firehose", "describe-delivery-stream"): self.firehose_stream([]),
            ("athena", "list-work-groups"): {"WorkGroups": [{"Name": "workgroup"}]},
            ("athena", "get-work-group"): {"WorkGroup": {"Configuration": {
                "CustomerContentEncryptionConfiguration": {"KmsKey": KEY_ARN},
            }}},
            ("lambda", "list-functions"): {"Functions": [{
                "FunctionName": "function", "FunctionArn": "arn:function",
                "Version": "1", "KMSKeyArn": KEY_ARN,
            }]},
            ("lambda", "get-function"): {"Configuration": {"KMSKeyArn": KEY_ARN}, "Code": {}},
            ("codebuild", "list-projects"): {"projects": ["project"]},
            ("codebuild", "batch-get-projects"): {"projects": [{
                "name": "project", "arn": "arn:project", "encryptionKey": KEY_ARN,
            }]},
            ("events", "list-event-buses"): {"EventBuses": [{"Name": "bus"}]},
            ("events", "describe-event-bus"): {"Arn": "arn:bus", "KmsKeyIdentifier": KEY_ARN},
            ("cloudtrail", "list-trails"): {"Trails": [{
                "TrailARN": "arn:trail", "HomeRegion": "eu-south-1",
            }]},
            ("cloudtrail", "get-trail"): {"Trail": {"Name": "trail", "KmsKeyId": KEY_ARN}},
            **EMPTY_NEW_RESOURCES,
        }

        def call(service, operation, *args):
            self.assertIn((service, operation), v.AwsClient.ALLOWED_OPERATIONS)
            return responses[(service, operation)]

        self.client.call.side_effect = call
        result = self.scanner.scan()
        self.assertFalse(result.errors)
        self.assertEqual(len(result.associations[KEY_ARN]), 11)
        self.assertEqual(len({a.resource_type for a in result.associations[KEY_ARN]}), 11)
        self.assertEqual(self.client.call.call_count, len(responses))
        self.assertEqual(result.status(OTHER_ARN), "NO_ASSOCIATION_FOUND")
        responses[("backup", "list-recovery-points-by-backup-vault")] = None

        def partial(service, operation, *args):
            response = call(service, operation, *args)
            if response is None:
                raise v.ScanError("AccessDenied")
            return response

        scanner = v.ResourceScanner(self.client, {KEY_ARN, OTHER_ARN}, ACCOUNT, "aws")
        self.client.call.side_effect = partial
        with self.assertLogs(v.LOGGER, level="ERROR"):
            result = scanner.scan()
        self.assertEqual(len(result.associations[KEY_ARN]), 10)
        self.assertEqual(result.status(KEY_ARN), "ASSOCIATED")
        self.assertEqual(result.status(OTHER_ARN), "SCAN_INCOMPLETE")


if __name__ == "__main__":
    unittest.main()
