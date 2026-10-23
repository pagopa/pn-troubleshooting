import json
import unittest
from unittest.mock import Mock

import manage_kms_keys as v
from test_verify_kms_associations import ACCOUNT, KEY_ID, KEY_ARN, OTHER_ARN

UNRELATED_KEY_ID = "11111111-2222-3333-4444-555555555555"
EMPTY_NEW_RESOURCES = {
    ("elasticache", "describe-replication-groups"): {"ReplicationGroups": []},
    ("elasticache", "describe-snapshots"): {"Snapshots": []},
    ("elasticache", "describe-serverless-cache-snapshots"): {"ServerlessCacheSnapshots": []},
    ("ec2", "get-ebs-encryption-by-default"): {"EbsEncryptionByDefault": False},
    ("ec2", "get-ebs-default-kms-key-id"): {"KmsKeyId": UNRELATED_KEY_ID},
    ("ec2", "describe-volumes"): {"Volumes": []},
    ("ec2", "describe-snapshots"): {"Snapshots": []},
    ("ec2", "describe-images"): {"Images": []},
    ("ec2", "describe-launch-templates"): {"LaunchTemplates": []},
    ("ses", "list-receipt-rule-sets"): {"RuleSets": []},
    ("mailmanager", "list-archives"): {"Archives": []},
    ("mailmanager", "list-rule-sets"): {"RuleSets": []},
    ("ssm", "describe-parameters"): {"Parameters": []},
    ("ecr", "describe-repositories"): {"repositories": []},
    ("ecr", "describe-repository-creation-templates"): {"repositoryCreationTemplates": []},
    ("stepfunctions", "list-state-machines"): {"stateMachines": []},
    ("stepfunctions", "list-activities"): {"activities": []},
    ("codepipeline", "list-pipelines"): {"pipelines": []},
    ("ecs", "list-clusters"): {"clusterArns": []},
    ("cognito-idp", "list-user-pools"): {"UserPools": []},
    ("glue", "get-data-catalog-encryption-settings"): {"DataCatalogEncryptionSettings": {
        "EncryptionAtRest": {"CatalogEncryptionMode": "DISABLED"},
    }},
    ("glue", "get-security-configurations"): {"SecurityConfigurations": []},
    ("xray", "get-encryption-config"): {"EncryptionConfig": {"Type": "NONE"}},
    ("quicksight", "describe-key-registration"): {"KeyRegistration": []},
}


class Ec2SesElastiCacheTests(unittest.TestCase):
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

    def payloads(self, service, operation):
        return [
            json.loads(call.args[-1]) for call in self.client.call.call_args_list
            if call.args[:2] == (service, operation)
        ]

    def test_elasticache_replication_groups_and_snapshots(self):
        self.route({
            ("elasticache", "describe-replication-groups"): [
                {"ReplicationGroups": [
                    {"ReplicationGroupId": "rg", "ARN": "arn:rg",
                     "AtRestEncryptionEnabled": True, "KmsKeyId": KEY_ARN},
                    {"ReplicationGroupId": "aws-key", "ARN": "arn:aws-key",
                     "AtRestEncryptionEnabled": True},
                    {"ReplicationGroupId": "plain", "ARN": "arn:plain",
                     "AtRestEncryptionEnabled": False, "KmsKeyId": OTHER_ARN},
                ], "Marker": "p2"},
                {"ReplicationGroups": []},
            ],
            ("elasticache", "describe-snapshots"): {"Snapshots": [
                {"SnapshotName": "snap", "ARN": "arn:snap", "KmsKeyId": KEY_ID},
            ]},
            ("elasticache", "describe-serverless-cache-snapshots"): {
                "ServerlessCacheSnapshots": [{
                    "ServerlessCacheSnapshotName": "ssnap", "ARN": "arn:ssnap",
                    "KmsKeyId": KEY_ARN,
                }],
            },
        })
        self.scanner.scan_elasticache_managed()
        self.assertEqual(
            {m.resource_type for m in self.matches()},
            {"AWS::ElastiCache::ReplicationGroup", "AWS::ElastiCache::Snapshot",
             "AWS::ElastiCache::ServerlessCacheSnapshot"},
        )
        self.assertFalse(self.matches(OTHER_ARN))
        self.assertEqual(
            self.payloads("elasticache", "describe-replication-groups")[-1]["Marker"], "p2"
        )
        self.assertFalse(self.scanner.result.errors)

    def test_elasticache_error_on_one_operation_continues(self):
        self.route({
            ("elasticache", "describe-replication-groups"): v.ScanError("AccessDenied"),
            ("elasticache", "describe-snapshots"): {"Snapshots": [
                {"SnapshotName": "snap", "ARN": "arn:snap", "KmsKeyId": KEY_ARN},
            ]},
            ("elasticache", "describe-serverless-cache-snapshots"): {
                "ServerlessCacheSnapshots": [],
            },
        })
        with self.assertLogs(v.LOGGER, level="ERROR"):
            self.scanner.scan_elasticache_managed()
        self.assertEqual(self.scanner.result.status(KEY_ARN), "ASSOCIATED")
        self.assertEqual(self.scanner.result.status(OTHER_ARN), "SCAN_INCOMPLETE")

    def test_ec2_default_key_volumes_snapshots_images_and_templates(self):
        self.route({
            ("ec2", "get-ebs-encryption-by-default"): {"EbsEncryptionByDefault": True},
            ("ec2", "get-ebs-default-kms-key-id"): {"KmsKeyId": OTHER_ARN},
            ("ec2", "describe-volumes"): [
                {"Volumes": [
                    {"VolumeId": "vol-1", "Encrypted": True, "KmsKeyId": KEY_ARN},
                    {"VolumeId": "vol-2", "Encrypted": False},
                ], "NextToken": "p2"},
                {"Volumes": []},
            ],
            ("ec2", "describe-snapshots"): {"Snapshots": [
                {"SnapshotId": "snap-1", "Encrypted": True, "KmsKeyId": KEY_ID},
            ]},
            ("ec2", "describe-images"): {"Images": [{
                "ImageId": "ami-1", "BlockDeviceMappings": [
                    {"DeviceName": "/dev/xvda", "Ebs": {"KmsKeyId": KEY_ARN}},
                    {"DeviceName": "/dev/sdb", "VirtualName": "ephemeral0"},
                ],
            }]},
            ("ec2", "describe-launch-templates"): {"LaunchTemplates": [
                {"LaunchTemplateId": "lt-1", "LaunchTemplateName": "tpl"},
            ]},
            ("ec2", "describe-launch-template-versions"): {"LaunchTemplateVersions": [
                {"VersionNumber": 3, "LaunchTemplateData": {"BlockDeviceMappings": [
                    {"DeviceName": "/dev/xvda", "Ebs": {"KmsKeyId": KEY_ARN}},
                ]}},
                {"VersionNumber": 4, "LaunchTemplateData": {}},
            ]},
        })
        self.scanner.scan_ec2()
        by_type = {m.resource_type: m for m in self.matches()}
        self.assertEqual(set(by_type), {
            "AWS::EC2::Volume", "AWS::EC2::Snapshot", "AWS::EC2::Image",
            "AWS::EC2::LaunchTemplate",
        })
        self.assertEqual(
            by_type["AWS::EC2::Volume"].resource_arn,
            f"arn:aws:ec2:eu-south-1:{ACCOUNT}:volume/vol-1",
        )
        self.assertEqual(
            by_type["AWS::EC2::Snapshot"].resource_arn,
            "arn:aws:ec2:eu-south-1::snapshot/snap-1",
        )
        self.assertEqual(
            by_type["AWS::EC2::Image"].property_name,
            "BlockDeviceMappings[/dev/xvda].Ebs.KmsKeyId",
        )
        self.assertEqual(by_type["AWS::EC2::LaunchTemplate"].resource_name, "tpl:v3")
        default = next(iter(self.matches(OTHER_ARN)))
        self.assertEqual(default.resource_type, "AWS::EC2::EBSDefaultEncryption")
        self.assertIn("EbsEncryptionByDefault=true", default.property_name)
        self.assertEqual(self.payloads("ec2", "describe-volumes")[-1]["NextToken"], "p2")
        self.assertEqual(self.payloads("ec2", "describe-snapshots")[0]["OwnerIds"], ["self"])
        self.assertEqual(self.payloads("ec2", "describe-images")[0]["Owners"], ["self"])
        self.assertEqual(
            self.payloads("ec2", "describe-launch-template-versions")[0]["Versions"],
            ["$Default", "$Latest"],
        )
        self.assertFalse(self.scanner.result.errors)

    def test_ec2_malformed_volume_and_default_key_error_are_incomplete(self):
        responses = dict(EMPTY_NEW_RESOURCES)
        responses[("ec2", "get-ebs-default-kms-key-id")] = v.ScanError("AccessDenied")
        responses[("ec2", "describe-volumes")] = {"Volumes": [
            {"VolumeId": "vol-1", "Encrypted": True},
            {"VolumeId": "vol-2", "Encrypted": True, "KmsKeyId": KEY_ARN},
        ]}
        self.route(responses)
        with self.assertLogs(v.LOGGER, level="ERROR"):
            self.scanner.scan_ec2()
        self.assertEqual(len(self.scanner.result.errors), 2)
        self.assertEqual(self.scanner.result.status(KEY_ARN), "ASSOCIATED")
        self.assertEqual(self.scanner.result.status(OTHER_ARN), "SCAN_INCOMPLETE")

    def test_ses_receipt_rules_and_mail_manager(self):
        self.route({
            ("ses", "list-receipt-rule-sets"): {"RuleSets": [{"Name": "inbound"}]},
            ("ses", "describe-receipt-rule-set"): {"Rules": [
                {"Name": "to-s3", "Actions": [
                    {"S3Action": {"BucketName": "b", "KmsKeyArn": KEY_ARN}},
                    {"StopAction": {"Scope": "RuleSet"}},
                ]},
                {"Name": "bounce", "Actions": [{"BounceAction": {}}]},
            ]},
            ("mailmanager", "list-archives"): {"Archives": [
                {"ArchiveId": "a-1"}, {"ArchiveId": "a-2"},
            ]},
            ("mailmanager", "get-archive"): [
                {"ArchiveName": "arch", "ArchiveArn": "arn:arch", "KmsKeyArn": OTHER_ARN},
                {"ArchiveName": "default", "ArchiveArn": "arn:default"},
            ],
            ("mailmanager", "list-rule-sets"): {"RuleSets": [{"RuleSetId": "rs-1"}]},
            ("mailmanager", "get-rule-set"): {
                "RuleSetArn": "arn:rs", "RuleSetName": "rules", "Rules": [
                    {"Name": "write", "Actions": [
                        {"WriteToS3": {"S3Bucket": "b", "S3SseKmsKeyId": KEY_ID}},
                    ]},
                ],
            },
        })
        self.scanner.scan_ses()
        by_type = {m.resource_type: m for m in self.matches()}
        self.assertEqual(set(by_type), {
            "AWS::SES::ReceiptRule", "AWS::SES::MailManagerRuleSet",
        })
        self.assertEqual(
            by_type["AWS::SES::ReceiptRule"].resource_arn,
            f"arn:aws:ses:eu-south-1:{ACCOUNT}:receipt-rule-set/inbound:receipt-rule/to-s3",
        )
        self.assertEqual(
            by_type["AWS::SES::MailManagerRuleSet"].property_name,
            "WriteToS3.S3SseKmsKeyId",
        )
        archive = next(iter(self.matches(OTHER_ARN)))
        self.assertEqual(archive.resource_type, "AWS::SES::MailManagerArchive")
        self.assertEqual(self.payloads("mailmanager", "list-archives")[0]["PageSize"], 50)
        self.assertFalse(self.scanner.result.errors)

    def test_ses_unavailable_mail_manager_is_incomplete_but_ses_continues(self):
        self.route({
            ("ses", "list-receipt-rule-sets"): {"RuleSets": []},
            ("mailmanager", "list-archives"): v.ScanError("Could not connect"),
            ("mailmanager", "list-rule-sets"): {"RuleSets": []},
        })
        with self.assertLogs(v.LOGGER, level="ERROR"):
            self.scanner.scan_ses()
        self.assertEqual(len(self.scanner.result.errors), 1)
        self.assertEqual(self.scanner.result.status(KEY_ARN), "SCAN_INCOMPLETE")

    def test_new_scanners_reject_missing_collections(self):
        for method in ("scan_elasticache_managed", "scan_ec2", "scan_ses"):
            with self.subTest(method=method):
                scanner = v.ResourceScanner(self.client, {KEY_ARN}, ACCOUNT, "aws")
                self.client.call.side_effect = lambda *args: {}
                with self.assertLogs(v.LOGGER, level="ERROR"):
                    getattr(scanner, method)()
                self.assertEqual(scanner.result.status(KEY_ARN), "SCAN_INCOMPLETE")


if __name__ == "__main__":
    unittest.main()
