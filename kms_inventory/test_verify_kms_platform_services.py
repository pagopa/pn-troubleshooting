import json
import unittest
from unittest.mock import Mock

import manage_kms_keys as v
from test_verify_kms_associations import ACCOUNT, KEY_ID, KEY_ARN, OTHER_ARN

PLATFORM_SCANS = (
    "scan_ssm", "scan_ecr", "scan_stepfunctions", "scan_codepipeline", "scan_ecs",
    "scan_cognito", "scan_glue", "scan_xray", "scan_quicksight",
)


class PlatformServiceTests(unittest.TestCase):
    def setUp(self):
        self.client = Mock(region="eu-south-1")
        self.client.call.side_effect = AssertionError("Chiamata non simulata")
        self.scanner = v.ResourceScanner(
            self.client, {KEY_ARN, OTHER_ARN}, ACCOUNT, "aws"
        )

    def route(self, responses):
        def call(service, operation, *args):
            self.assertIn((service, operation), v.AwsClient.ALLOWED_OPERATIONS)
            response = responses[(service, operation)]
            if isinstance(response, list):
                response = response.pop(0)
            if isinstance(response, Exception):
                raise response
            return response
        self.client.call.side_effect = call

    def matches(self, arn=KEY_ARN):
        return self.scanner.result.associations[arn]

    def calls(self, service, operation):
        return [c.args for c in self.client.call.call_args_list if c.args[:2] == (service, operation)]

    def payloads(self, service, operation):
        return [json.loads(args[-1]) for args in self.calls(service, operation)]

    def test_ssm_secure_strings_explicit_and_default_key(self):
        self.route({("ssm", "describe-parameters"): [
            {"Parameters": [
                {"Name": "/a", "ARN": "arn:a", "KeyId": KEY_ID},
                {"Name": "/b", "ARN": "arn:b", "KeyId": "alias/custom"},
            ], "NextToken": "p2"},
            {"Parameters": [{"Name": "/c", "ARN": "arn:c"}]},
        ], ("kms", "list-aliases"): {"Aliases": [
            {"AliasName": "alias/custom", "TargetKeyId": OTHER_ARN.rsplit("/", 1)[-1]},
            {"AliasName": "alias/aws/ssm", "TargetKeyId": "99999999-9999-9999-9999-999999999999"},
        ]}})
        self.scanner.scan_ssm()
        self.assertEqual(next(iter(self.matches())).resource_type, "AWS::SSM::Parameter")
        self.assertEqual(next(iter(self.matches(OTHER_ARN))).resource_name, "/b")
        first = self.payloads("ssm", "describe-parameters")[0]
        self.assertEqual(first["ParameterFilters"][0]["Values"], ["SecureString"])
        self.assertEqual(self.payloads("ssm", "describe-parameters")[1]["NextToken"], "p2")
        self.assertFalse(self.scanner.result.errors)

    def test_ecr_repositories_and_creation_templates(self):
        self.route({
            ("ecr", "describe-repositories"): [
                {"repositories": [
                    {"repositoryName": "r1", "repositoryArn": "arn:r1",
                     "encryptionConfiguration": {"encryptionType": "KMS", "kmsKey": KEY_ARN}},
                    {"repositoryName": "r2", "repositoryArn": "arn:r2",
                     "encryptionConfiguration": {"encryptionType": "AES256"}},
                ], "nextToken": "p2"},
                {"repositories": []},
            ],
            ("ecr", "describe-repository-creation-templates"): {"repositoryCreationTemplates": [
                {"prefix": "ROOT", "encryptionConfiguration": {
                    "encryptionType": "KMS_DSSE", "kmsKey": OTHER_ARN,
                }},
            ]},
        })
        self.scanner.scan_ecr()
        self.assertEqual(next(iter(self.matches())).resource_name, "r1")
        template = next(iter(self.matches(OTHER_ARN)))
        self.assertEqual(template.resource_type, "AWS::ECR::RepositoryCreationTemplate")
        self.assertEqual(self.payloads("ecr", "describe-repositories")[1]["nextToken"], "p2")

    def test_stepfunctions_metadata_only_and_activities(self):
        self.route({
            ("stepfunctions", "list-state-machines"): {"stateMachines": [
                {"stateMachineArn": "arn:sm1", "name": "sm1"},
                {"stateMachineArn": "arn:sm2", "name": "sm2"},
            ]},
            ("stepfunctions", "describe-state-machine"): [
                {"encryptionConfiguration": {
                    "type": "CUSTOMER_MANAGED_KMS_KEY", "kmsKeyId": KEY_ARN,
                }},
                {"encryptionConfiguration": {"type": "AWS_OWNED_KEY"}},
            ],
            ("stepfunctions", "list-activities"): {"activities": [
                {"activityArn": "arn:act", "name": "act"},
            ]},
            ("stepfunctions", "describe-activity"): {"encryptionConfiguration": {
                "type": "CUSTOMER_MANAGED_KMS_KEY", "kmsKeyId": OTHER_ARN,
            }},
        })
        self.scanner.scan_stepfunctions()
        self.assertEqual(next(iter(self.matches())).resource_name, "sm1")
        self.assertEqual(
            next(iter(self.matches(OTHER_ARN))).resource_type, "AWS::StepFunctions::Activity"
        )
        for args in self.calls("stepfunctions", "describe-state-machine"):
            self.assertEqual(args[-2:], ("--included-data", "METADATA_ONLY"))

    def test_stepfunctions_customer_key_without_id_is_incomplete(self):
        self.route({
            ("stepfunctions", "list-state-machines"): {"stateMachines": [
                {"stateMachineArn": "arn:sm", "name": "sm"},
            ]},
            ("stepfunctions", "describe-state-machine"): {"encryptionConfiguration": {
                "type": "CUSTOMER_MANAGED_KMS_KEY",
            }},
            ("stepfunctions", "list-activities"): {"activities": []},
        })
        with self.assertLogs(v.LOGGER, level="ERROR"):
            self.scanner.scan_stepfunctions()
        self.assertEqual(self.scanner.result.status(KEY_ARN), "SCAN_INCOMPLETE")

    def test_codepipeline_single_and_regional_artifact_stores(self):
        self.route({
            ("codepipeline", "list-pipelines"): {"pipelines": [{"name": "p1"}, {"name": "p2"}]},
            ("codepipeline", "get-pipeline"): [
                {"pipeline": {"artifactStore": {
                    "type": "S3", "location": "b", "encryptionKey": {"id": KEY_ARN, "type": "KMS"},
                }}, "metadata": {"pipelineArn": "arn:p1"}},
                {"pipeline": {"artifactStores": {
                    "eu-central-1": {"type": "S3", "location": "c"},
                    "eu-south-1": {"type": "S3", "location": "b",
                                   "encryptionKey": {"id": OTHER_ARN, "type": "KMS"}},
                }}},
            ],
        })
        self.scanner.scan_codepipeline()
        self.assertEqual(next(iter(self.matches())).resource_arn, "arn:p1")
        other = next(iter(self.matches(OTHER_ARN)))
        self.assertEqual(
            other.resource_arn, f"arn:aws:codepipeline:eu-south-1:{ACCOUNT}:p2"
        )
        self.assertEqual(other.property_name, "encryptionKey.id")

    def test_ecs_cluster_configuration_keys(self):
        self.route({
            ("ecs", "list-clusters"): {"clusterArns": ["arn:c1", "arn:c2"]},
            ("ecs", "describe-clusters"): [
                {"clusters": [{"clusterName": "c1", "configuration": {
                    "executeCommandConfiguration": {"kmsKeyId": KEY_ARN},
                    "managedStorageConfiguration": {
                        "fargateEphemeralStorageKmsKeyId": OTHER_ARN,
                    },
                }}]},
                {"clusters": [{"clusterName": "c2"}]},
            ],
        })
        self.scanner.scan_ecs()
        self.assertEqual(
            next(iter(self.matches())).property_name,
            "configuration.executeCommandConfiguration.kmsKeyId",
        )
        self.assertEqual(next(iter(self.matches(OTHER_ARN))).resource_name, "c1")
        self.assertIn("CONFIGURATIONS", self.calls("ecs", "describe-clusters")[0])

    def test_ecs_missing_cluster_is_incomplete(self):
        self.route({
            ("ecs", "list-clusters"): {"clusterArns": ["arn:c1"]},
            ("ecs", "describe-clusters"): {"clusters": [], "failures": [{"reason": "MISSING"}]},
        })
        with self.assertLogs(v.LOGGER, level="ERROR"):
            self.scanner.scan_ecs()
        self.assertEqual(self.scanner.result.status(KEY_ARN), "SCAN_INCOMPLETE")

    def test_cognito_custom_sender_key(self):
        self.route({
            ("cognito-idp", "list-user-pools"): {"UserPools": [{"Id": "p1"}, {"Id": "p2"}]},
            ("cognito-idp", "describe-user-pool"): [
                {"UserPool": {"Name": "pool", "Arn": "arn:pool",
                              "LambdaConfig": {"KMSKeyID": KEY_ARN}}},
                {"UserPool": {"Name": "plain", "Arn": "arn:plain", "LambdaConfig": {}}},
            ],
        })
        self.scanner.scan_cognito()
        self.assertEqual(len(self.matches()), 1)
        self.assertEqual(self.payloads("cognito-idp", "list-user-pools")[0]["MaxResults"], 60)

    def test_glue_catalog_and_security_configurations(self):
        self.route({
            ("glue", "get-data-catalog-encryption-settings"): {"DataCatalogEncryptionSettings": {
                "EncryptionAtRest": {"CatalogEncryptionMode": "SSE-KMS", "SseAwsKmsKeyId": KEY_ID},
                "ConnectionPasswordEncryption": {
                    "ReturnConnectionPasswordEncrypted": True, "AwsKmsKeyId": OTHER_ARN,
                },
            }},
            ("glue", "get-security-configurations"): {"SecurityConfigurations": [{
                "Name": "sec", "EncryptionConfiguration": {
                    "S3Encryption": [{"S3EncryptionMode": "SSE-KMS", "KmsKeyArn": KEY_ARN}],
                    "CloudWatchEncryption": {"CloudWatchEncryptionMode": "DISABLED"},
                    "JobBookmarksEncryption": {
                        "JobBookmarksEncryptionMode": "CSE-KMS", "KmsKeyArn": OTHER_ARN,
                    },
                },
            }], "NextToken": ""},
        })
        self.scanner.scan_glue()
        self.assertEqual(
            {m.resource_type for m in self.matches()},
            {"AWS::Glue::DataCatalog", "AWS::Glue::SecurityConfiguration"},
        )
        self.assertEqual(
            {m.property_name for m in self.matches(OTHER_ARN)},
            {"ConnectionPasswordEncryption.AwsKmsKeyId", "JobBookmarksEncryption.KmsKeyArn"},
        )
        self.assertFalse(self.scanner.result.errors)
        self.assertEqual(self.payloads("glue", "get-security-configurations")[0]["MaxResults"], 100)

    def test_glue_catalog_error_does_not_skip_security_configurations(self):
        self.route({
            ("glue", "get-data-catalog-encryption-settings"): v.ScanError("AccessDenied"),
            ("glue", "get-security-configurations"): {"SecurityConfigurations": [{
                "Name": "sec", "EncryptionConfiguration": {
                    "CloudWatchEncryption": {"KmsKeyArn": KEY_ARN},
                },
            }]},
        })
        with self.assertLogs(v.LOGGER, level="ERROR"):
            self.scanner.scan_glue()
        self.assertEqual(self.scanner.result.status(KEY_ARN), "ASSOCIATED")
        self.assertEqual(self.scanner.result.status(OTHER_ARN), "SCAN_INCOMPLETE")

    def test_xray_kms_and_none(self):
        self.route({("xray", "get-encryption-config"): [
            {"EncryptionConfig": {"Type": "KMS", "KeyId": KEY_ARN, "Status": "ACTIVE"}},
            {"EncryptionConfig": {"Type": "NONE", "Status": "ACTIVE"}},
        ]})
        self.scanner.scan_xray()
        self.assertEqual(next(iter(self.matches())).resource_type, "AWS::XRay::EncryptionConfig")
        self.scanner.scan_xray()
        self.assertEqual(len(self.matches()), 1)

    def test_quicksight_registered_keys_and_not_subscribed(self):
        self.route({("quicksight", "describe-key-registration"): [
            {"KeyRegistration": [{"KeyArn": KEY_ARN, "DefaultKey": True}]},
            v.ScanError("An error occurred (ResourceNotFoundException)"),
            v.ScanError("An error occurred (AccessDeniedException)"),
        ]})
        self.scanner.scan_quicksight()
        self.assertEqual(len(self.matches()), 1)
        self.assertIn(ACCOUNT, self.calls("quicksight", "describe-key-registration")[0])
        self.scanner.scan_quicksight()
        self.assertFalse(self.scanner.result.errors)
        with self.assertRaises(v.ScanError):
            self.scanner.scan_quicksight()

    def test_platform_scanners_reject_malformed_responses(self):
        for method in PLATFORM_SCANS:
            with self.subTest(method=method):
                scanner = v.ResourceScanner(self.client, {KEY_ARN}, ACCOUNT, "aws")
                self.client.call.side_effect = lambda *args: {"KeyRegistration": "bad"}
                try:
                    with self.assertLogs(v.LOGGER, level="ERROR"):
                        getattr(scanner, method)()
                except v.ScanError:
                    scanner.result.errors.append("raised")
                self.assertEqual(scanner.result.status(KEY_ARN), "SCAN_INCOMPLETE")


if __name__ == "__main__":
    unittest.main()
