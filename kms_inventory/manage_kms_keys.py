#!/usr/bin/env python3

import argparse
import csv
import json
import logging
import re
import subprocess
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path


REGION = "eu-south-1"
LOGGER = logging.getLogger(__name__)
INPUT_FIELDS = ("id", "alias", "tags", "creation_date", "last_usage_date")
SCOPE_FIELDS = (
    "AccountId", "Region", "CheckedServices", "CheckedAt",
    "ScanComplete", "ScanErrors",
)
REPORT_FIELDS = (
    *INPUT_FIELDS, "Microservice", "KeyArn", "Status", "ResourceType",
    "ResourceName", "ResourceArn", "Property", "KeyReference", *SCOPE_FIELDS,
)
SUMMARY_FIELDS = (
    "Microservice", "TotalKeys", "AssociatedKeys", "NoAssociationFoundKeys",
    "ScanIncompleteKeys", "Associations", *SCOPE_FIELDS,
)
KEY_ID_PATTERN = re.compile(
    r"(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|mrk-[0-9a-fA-F]{32})"
)
KEY_ARN_PATTERN = re.compile(
    r"arn:[^:]+:kms:[^:]+:[0-9]{12}:key/[^/:\s]+"
)
MISSING_MICROSERVICE = "(senza tag Microservice)"
CHECKED_SERVICES = (
    "CloudWatch Logs", "Kinesis", "S3", "DynamoDB", "SQS", "SNS",
    "RDS", "Secrets Manager",
    "ElastiCache Serverless", "ElastiCache gestito", "OpenSearch", "EFS",
    "AWS Backup", "Firehose", "Athena", "Lambda", "CodeBuild", "EventBridge",
    "CloudTrail", "EC2/EBS", "SES", "Systems Manager Parameter Store", "ECR",
    "Step Functions", "CodePipeline", "ECS", "Cognito", "Glue", "X-Ray",
    "QuickSight",
)


class ScanError(RuntimeError):
    pass


@dataclass(frozen=True)
class KeyRecord:
    key_id: str
    alias: str
    tags: str
    creation_date: str
    last_usage_date: str
    microservice: str

    def csv_values(self):
        return dict(zip(INPUT_FIELDS, (
            self.key_id, self.alias, self.tags,
            self.creation_date, self.last_usage_date,
        )))


@dataclass(frozen=True)
class Association:
    resource_type: str
    resource_name: str
    resource_arn: str
    property_name: str
    key_reference: str


@dataclass
class ScanResult:
    associations: dict[str, set[Association]] = field(
        default_factory=lambda: defaultdict(set)
    )
    errors: list[str] = field(default_factory=list)
    resource_count: int = 0

    def record_error(self, message):
        self.errors.append(message)
        LOGGER.error("%s", message)

    def status(self, key_arn):
        if self.associations.get(key_arn):
            return "ASSOCIATED"
        return "SCAN_INCOMPLETE" if self.errors else "NO_ASSOCIATION_FOUND"


class AwsClient:
    ALLOWED_OPERATIONS = {
        ("sts", "get-caller-identity"),
        ("logs", "describe-log-groups"),
        ("kms", "list-aliases"),
        ("kinesis", "list-streams"),
        ("kinesis", "describe-stream-summary"),
        ("s3api", "list-buckets"),
        ("s3api", "get-bucket-location"),
        ("s3api", "get-bucket-encryption"),
        ("dynamodb", "list-tables"),
        ("dynamodb", "describe-table"),
        ("sqs", "list-queues"),
        ("sqs", "get-queue-attributes"),
        ("sns", "list-topics"),
        ("sns", "get-topic-attributes"),
        ("rds", "describe-db-instances"),
        ("rds", "describe-db-clusters"),
        ("rds", "describe-db-snapshots"),
        ("rds", "describe-db-cluster-snapshots"),
        ("secretsmanager", "list-secrets"),
        ("elasticache", "describe-serverless-caches"),
        ("elasticache", "describe-serverless-cache-snapshots"),
        ("elasticache", "describe-replication-groups"),
        ("elasticache", "describe-snapshots"),
        ("ec2", "get-ebs-default-kms-key-id"),
        ("ec2", "get-ebs-encryption-by-default"),
        ("ec2", "describe-volumes"),
        ("ec2", "describe-snapshots"),
        ("ec2", "describe-images"),
        ("ec2", "describe-launch-templates"),
        ("ec2", "describe-launch-template-versions"),
        ("ses", "list-receipt-rule-sets"),
        ("ses", "describe-receipt-rule-set"),
        ("mailmanager", "list-archives"),
        ("mailmanager", "get-archive"),
        ("mailmanager", "list-rule-sets"),
        ("mailmanager", "get-rule-set"),
        ("ssm", "describe-parameters"),
        ("ecr", "describe-repositories"),
        ("ecr", "describe-repository-creation-templates"),
        ("stepfunctions", "list-state-machines"),
        ("stepfunctions", "describe-state-machine"),
        ("stepfunctions", "list-activities"),
        ("stepfunctions", "describe-activity"),
        ("codepipeline", "list-pipelines"),
        ("codepipeline", "get-pipeline"),
        ("ecs", "list-clusters"),
        ("ecs", "describe-clusters"),
        ("cognito-idp", "list-user-pools"),
        ("cognito-idp", "describe-user-pool"),
        ("glue", "get-data-catalog-encryption-settings"),
        ("glue", "get-security-configurations"),
        ("xray", "get-encryption-config"),
        ("quicksight", "describe-key-registration"),
        ("opensearch", "list-domain-names"),
        ("opensearch", "describe-domain"),
        ("efs", "describe-file-systems"),
        ("backup", "list-backup-vaults"),
        ("backup", "list-recovery-points-by-backup-vault"),
        ("firehose", "list-delivery-streams"),
        ("firehose", "describe-delivery-stream"),
        ("athena", "list-work-groups"),
        ("athena", "get-work-group"),
        ("lambda", "list-functions"),
        ("lambda", "get-function"),
        ("codebuild", "list-projects"),
        ("codebuild", "batch-get-projects"),
        ("events", "list-event-buses"),
        ("events", "describe-event-bus"),
        ("cloudtrail", "list-trails"),
        ("cloudtrail", "get-trail"),
    }
    WRITE_OPERATIONS = {
        ("kms", "disable-key"),
        ("kms", "enable-key"),
        ("kms", "schedule-key-deletion"),
        ("kms", "cancel-key-deletion"),
    }
    # Concedibili solo esplicitamente, una modalita' alla volta (extra_operations).
    # describe-key resta escluso dal report: con alias AWS puo' creare la chiave gestita.
    GRANTABLE_OPERATIONS = {("kms", "describe-key"), *WRITE_OPERATIONS}

    def __init__(self, profile, region, timeout, extra_operations=()):
        extra = frozenset(extra_operations)
        if not extra <= self.GRANTABLE_OPERATIONS:
            raise ValueError(f"Operazioni non concedibili: {sorted(extra - self.GRANTABLE_OPERATIONS)}")
        self.profile = profile
        self.region = region
        self.timeout = timeout
        self.allowed = frozenset(self.ALLOWED_OPERATIONS) | extra
        self.calls = 0

    def call(self, service, operation, *args):
        if (service, operation) not in self.allowed:
            raise ValueError(f"Operazione AWS non prevista: {service} {operation}")
        self.calls += 1
        command = [
            "aws", service, operation,
            "--profile", self.profile, "--region", self.region,
            "--output", "json", "--no-cli-pager", "--no-cli-auto-prompt",
            *args,
        ]
        started = time.monotonic()
        LOGGER.debug("AWS #%d: %s %s", self.calls, service, operation)
        try:
            result = subprocess.run(
                command, capture_output=True, text=True, check=False,
                timeout=self.timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise ScanError(
                f"{service} {operation}: timeout dopo {self.timeout}s"
            ) from exc
        except OSError as exc:
            raise ScanError(f"Impossibile eseguire AWS CLI: {exc}") from exc
        LOGGER.debug(
            "AWS %s %s completata in %.2fs",
            service, operation, time.monotonic() - started,
        )
        if result.returncode:
            error = result.stderr.strip() or f"exit code {result.returncode}"
            raise ScanError(f"{service} {operation}: {error}")
        if (service, operation) in self.WRITE_OPERATIONS and not result.stdout.strip():
            return {}
        try:
            response = json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            raise ScanError(f"{service} {operation}: JSON non valido") from exc
        if not isinstance(response, dict):
            raise ScanError(f"{service} {operation}: atteso un oggetto JSON")
        return response


def load_keys(input_path, microservice=None):
    keys = []
    seen = set()
    with input_path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames is None or set(reader.fieldnames) != set(INPUT_FIELDS):
            raise ValueError(
                "Intestazione CSV non valida: attese le colonne "
                + ", ".join(INPUT_FIELDS)
            )
        if len(reader.fieldnames) != len(INPUT_FIELDS):
            raise ValueError("Intestazione CSV con colonne duplicate")
        for row in reader:
            if None in row or any(value is None for value in row.values()):
                raise ValueError(f"Riga CSV {reader.line_num}: numero colonne errato")
            key_id = row["id"].strip()
            if not KEY_ID_PATTERN.fullmatch(key_id):
                raise ValueError(f"Riga CSV {reader.line_num}: ID chiave non valido")
            if key_id in seen:
                raise ValueError(f"Riga CSV {reader.line_num}: ID duplicato {key_id}")
            seen.add(key_id)
            services = {
                value.strip()
                for tag in row["tags"].split(";")
                for name, separator, value in [tag.partition("=")]
                if separator and name.strip() == "Microservice" and value.strip()
            }
            if len(services) > 1:
                raise ValueError(f"Riga CSV {reader.line_num}: tag Microservice ambiguo")
            service = next(iter(services), MISSING_MICROSERVICE)
            if microservice is None or microservice == service:
                keys.append(KeyRecord(
                    key_id, row["alias"], row["tags"], row["creation_date"],
                    row["last_usage_date"], service,
                ))
    if not keys:
        raise ValueError("Nessuna chiave selezionata: controllare CSV e --microservice")
    LOGGER.info("CSV: %d chiavi selezionate", len(keys))
    return keys


def get_account(client):
    identity = client.call("sts", "get-caller-identity")
    account = identity.get("Account")
    if not isinstance(account, str) or not re.fullmatch(r"[0-9]{12}", account):
        raise ScanError("Risposta STS non valida: account assente o non valido")
    arn = identity.get("Arn")
    if not isinstance(arn, str) or not re.fullmatch(
        rf"arn:[^:]+:(?:iam|sts)::{account}:.+", arn
    ):
        raise ScanError("Risposta STS non valida: ARN identita' assente o non valido")
    return account, arn.split(":")[1]


def scan_cloudwatch_logs(client, key_arns):
    result = ScanResult()
    next_token = None
    seen_tokens = set()
    page = 0
    started = time.monotonic()
    while True:
        page += 1
        LOGGER.info(
            "CloudWatch Logs: recupero pagina %d, %d log group esaminati",
            page, result.resource_count,
        )
        request: dict[str, int | str] = {"limit": 50}
        if next_token is not None:
            request["nextToken"] = next_token
        try:
            response = client.call(
                "logs", "describe-log-groups",
                "--no-paginate", "--cli-input-json", json.dumps(request),
            )
        except ScanError as exc:
            result.record_error(f"CloudWatch Logs pagina {page}: {exc}")
            break
        groups = response.get("logGroups")
        if not isinstance(groups, list):
            result.record_error(f"CloudWatch Logs pagina {page}: logGroups non valido")
            break
        for group in groups:
            result.resource_count += 1
            if not isinstance(group, dict):
                result.record_error(f"CloudWatch Logs pagina {page}: log group non valido")
                continue
            name, arn = group.get("logGroupName"), group.get("arn")
            if not isinstance(name, str) or not name or not isinstance(arn, str) or not arn:
                result.record_error(
                    f"CloudWatch Logs pagina {page}: nome/ARN log group non valido"
                )
                continue
            if "kmsKeyId" not in group:
                continue
            reference = group["kmsKeyId"]
            if not isinstance(reference, str) or not KEY_ARN_PATTERN.fullmatch(reference):
                result.record_error(f"CloudWatch Logs {name}: kmsKeyId non valido")
                continue
            LOGGER.debug("Log group %s: kmsKeyId=%s", name, reference)
            if reference in key_arns:
                result.associations[reference].add(Association(
                    "AWS::Logs::LogGroup", name, arn, "kmsKeyId", reference,
                ))
        LOGGER.info(
            "CloudWatch Logs: pagina %d completata, %d log group, %d chiavi associate",
            page, result.resource_count, len(result.associations),
        )
        next_token = response.get("nextToken")
        if next_token is None:
            break
        if not isinstance(next_token, str) or not next_token or next_token in seen_tokens:
            result.record_error("CloudWatch Logs: token di paginazione non valido o ripetuto")
            break
        seen_tokens.add(next_token)
    LOGGER.info(
        "CloudWatch Logs: completata in %.2fs, %d log group, %d errori",
        time.monotonic() - started, result.resource_count, len(result.errors),
    )
    return result


class ResourceScanner:
    def __init__(self, client, key_arns, account, partition):
        self.client = client
        self.key_arns = key_arns
        self.account = account
        self.partition = partition
        self.result = ScanResult()
        self.aliases = None
        self.alias_error = None

    def pages(
        self, service, operation, collection, request=None,
        response_token="NextToken", request_token="NextToken",
        optional_collection=False,
    ):
        payload = dict(request or {})
        seen_tokens = set()
        page = 0
        while True:
            page += 1
            LOGGER.info("%s %s: pagina %d", service, operation, page)
            response = self.client.call(
                service, operation, "--no-paginate",
                "--cli-input-json", json.dumps(payload),
            )
            items = response.get(collection, [] if optional_collection else None)
            if not isinstance(items, list):
                raise ScanError(f"{service} {operation}: {collection} non valido")
            yield items
            token = response.get(response_token)
            next_request_token = request_token
            if service == "kinesis" and response.get("HasMoreStreams"):
                if not token:
                    if not items or not isinstance(items[-1], str):
                        raise ScanError("Kinesis: pagina incompleta senza stream finale")
                    token = items[-1]
                    next_request_token = "ExclusiveStartStreamName"
            elif service == "kms" and response.get("Truncated") and not token:
                raise ScanError("KMS list-aliases: pagina troncata senza marker")
            # Alcuni servizi, ad esempio Glue, chiudono la paginazione con token vuoto.
            if token is None or token == "":
                break
            if not isinstance(token, str) or not token or token in seen_tokens:
                raise ScanError(f"{service} {operation}: token non valido o ripetuto")
            seen_tokens.add(token)
            if service == "kinesis":
                payload.pop("NextToken", None)
                payload.pop("ExclusiveStartStreamName", None)
            payload[next_request_token] = token

    def items(self, *args, **kwargs):
        count = 0
        for page in self.pages(*args, **kwargs):
            for item in page:
                count += 1
                if count == 1 or count % 25 == 0:
                    LOGGER.info("%s %s: elemento %d", args[0], args[1], count)
                yield item

    @staticmethod
    def required(data, field_name, expected_type=str):
        if not isinstance(data, dict):
            raise ScanError(f"Risorsa non valida: atteso oggetto per {field_name}")
        value = data.get(field_name)
        if not isinstance(value, expected_type) or (expected_type is str and not value):
            raise ScanError(f"Campo obbligatorio non valido: {field_name}")
        return value

    def resolve_key(self, reference):
        if not isinstance(reference, str) or not reference:
            raise ScanError("Riferimento KMS non valido")
        if KEY_ARN_PATTERN.fullmatch(reference):
            return reference
        if KEY_ID_PATTERN.fullmatch(reference):
            return (
                f"arn:{self.partition}:kms:{self.client.region}:"
                f"{self.account}:key/{reference}"
            )
        alias_prefix = (
            f"arn:{self.partition}:kms:{self.client.region}:{self.account}:alias/"
        )
        if reference.startswith("arn:") and ":alias/" in reference:
            if not reference.startswith(alias_prefix):
                return reference
            reference_name = "alias/" + reference[len(alias_prefix):]
        elif reference.startswith("alias/") and len(reference) > len("alias/"):
            reference_name = reference
        else:
            raise ScanError(f"Formato riferimento KMS non supportato: {reference}")
        if self.alias_error is not None:
            raise ScanError(self.alias_error)
        if self.aliases is None:
            try:
                aliases = {}
                for alias in self.items(
                    "kms", "list-aliases", "Aliases", {"Limit": 100},
                    response_token="NextMarker", request_token="Marker",
                ):
                    name = self.required(alias, "AliasName")
                    target = alias.get("TargetKeyId")
                    if target:
                        if not isinstance(target, str) or not KEY_ID_PATTERN.fullmatch(target):
                            raise ScanError(f"TargetKeyId non valido per {name}")
                        aliases[name] = target
                self.aliases = aliases
            except ScanError as exc:
                self.alias_error = f"Risoluzione alias KMS non disponibile: {exc}"
                raise ScanError(self.alias_error) from exc
        target = self.aliases.get(reference_name)
        if target is None:
            raise ScanError(f"Alias KMS non risolto: {reference}")
        return self.resolve_key(target)

    def link(self, reference, resource_type, name, arn, property_name):
        resolved = self.resolve_key(reference)
        if resolved in self.key_arns:
            self.result.associations[resolved].add(Association(
                resource_type, name, arn, property_name, reference,
            ))
            LOGGER.debug(
                "Associazione: %s %s, %s=%s -> %s",
                resource_type, name, property_name, reference, resolved,
            )

    def scan_detailed(self, service, operation, collection, inspect, **kwargs):
        for item in self.items(service, operation, collection, **kwargs):
            self.result.resource_count += 1
            try:
                inspect(item)
            except ScanError as exc:
                if isinstance(item, dict):
                    label = next((
                        item[name] for name in (
                            "Name", "TopicArn", "ARN", "DBInstanceIdentifier",
                            "DBClusterIdentifier", "DBSnapshotIdentifier",
                            "DBClusterSnapshotIdentifier", "ServerlessCacheName",
                            "DomainName", "FileSystemId", "BackupVaultName",
                            "RecoveryPointArn", "FunctionName", "name",
                            "ReplicationGroupId", "SnapshotName",
                            "ServerlessCacheSnapshotName", "VolumeId", "SnapshotId",
                            "ImageId", "LaunchTemplateId", "ArchiveId", "RuleSetId",
                            "repositoryName", "prefix", "stateMachineArn",
                            "activityArn", "Id",
                        ) if isinstance(item.get(name), str) and item[name]
                    ), "(identificativo assente)")
                else:
                    label = str(item)
                self.result.record_error(f"{service} {operation} {label}: {exc}")

    def scan_kinesis(self):
        def inspect(name):
            if not isinstance(name, str) or not name:
                raise ScanError("Nome stream non valido")
            response = self.client.call(
                "kinesis", "describe-stream-summary", "--stream-name", name
            )
            stream = self.required(response, "StreamDescriptionSummary", dict)
            if self.required(stream, "EncryptionType") == "KMS":
                self.link(
                    self.required(stream, "KeyId"), "AWS::Kinesis::Stream",
                    name, self.required(stream, "StreamARN"), "KeyId",
                )
        self.scan_detailed(
            "kinesis", "list-streams", "StreamNames", inspect, request={"Limit": 100}
        )

    def scan_s3(self):
        def inspect(bucket):
            name = self.required(bucket, "Name")
            location = self.client.call(
                "s3api", "get-bucket-location", "--bucket", name,
                "--expected-bucket-owner", self.account,
            )
            if "LocationConstraint" not in location:
                raise ScanError("LocationConstraint assente")
            region = location["LocationConstraint"]
            if region is None:
                region = "us-east-1"
            elif region == "EU":
                region = "eu-west-1"
            if not isinstance(region, str) or not region:
                raise ScanError("LocationConstraint non valido")
            if region != self.client.region:
                return
            try:
                response = self.client.call(
                    "s3api", "get-bucket-encryption", "--bucket", name,
                    "--expected-bucket-owner", self.account,
                )
            except ScanError as exc:
                if "ServerSideEncryptionConfigurationNotFoundError" in str(exc):
                    LOGGER.info("S3 %s: nessuna cifratura predefinita configurata", name)
                    return
                raise
            config = self.required(response, "ServerSideEncryptionConfiguration", dict)
            for rule in self.required(config, "Rules", list):
                encryption = self.required(rule, "ApplyServerSideEncryptionByDefault", dict)
                if self.required(encryption, "SSEAlgorithm") in ("aws:kms", "aws:kms:dsse"):
                    self.link(
                        encryption.get("KMSMasterKeyID", "alias/aws/s3"),
                        "AWS::S3::Bucket", name, f"arn:{self.partition}:s3:::{name}",
                        "ServerSideEncryptionConfiguration.Rules."
                        "ApplyServerSideEncryptionByDefault.KMSMasterKeyID",
                    )
        self.scan_detailed(
            "s3api", "list-buckets", "Buckets", inspect,
            request={"MaxBuckets": 1000},
            response_token="ContinuationToken", request_token="ContinuationToken",
        )

    def scan_dynamodb(self):
        def inspect(name):
            if not isinstance(name, str) or not name:
                raise ScanError("Nome tabella non valido")
            table = self.required(self.client.call(
                "dynamodb", "describe-table", "--table-name", name
            ), "Table", dict)
            if "SSEDescription" in table:
                sse = self.required(table, "SSEDescription", dict)
                self.link(
                    self.required(sse, "KMSMasterKeyArn"), "AWS::DynamoDB::Table",
                    name, self.required(table, "TableArn"), "SSEDescription.KMSMasterKeyArn",
                )
        self.scan_detailed(
            "dynamodb", "list-tables", "TableNames", inspect, request={"Limit": 100},
            response_token="LastEvaluatedTableName", request_token="ExclusiveStartTableName",
        )

    def scan_sqs(self):
        def inspect(url):
            if not isinstance(url, str) or not url:
                raise ScanError("URL coda non valido")
            attributes = self.required(self.client.call(
                "sqs", "get-queue-attributes", "--queue-url", url,
                "--attribute-names", "QueueArn", "KmsMasterKeyId",
            ), "Attributes", dict)
            arn = self.required(attributes, "QueueArn")
            if "KmsMasterKeyId" in attributes and attributes["KmsMasterKeyId"] != "":
                self.link(
                    attributes["KmsMasterKeyId"], "AWS::SQS::Queue",
                    arn.rsplit(":", 1)[-1], arn, "KmsMasterKeyId",
                )
        self.scan_detailed(
            "sqs", "list-queues", "QueueUrls", inspect,
            request={"MaxResults": 1000}, optional_collection=True,
        )

    def scan_sns(self):
        def inspect(topic):
            arn = self.required(topic, "TopicArn")
            attributes = self.required(self.client.call(
                "sns", "get-topic-attributes", "--topic-arn", arn
            ), "Attributes", dict)
            if "KmsMasterKeyId" in attributes and attributes["KmsMasterKeyId"] != "":
                self.link(
                    attributes["KmsMasterKeyId"], "AWS::SNS::Topic",
                    arn.rsplit(":", 1)[-1], arn, "KmsMasterKeyId",
                )
        self.scan_detailed("sns", "list-topics", "Topics", inspect)

    def scan_rds(self):
        specs = (
            ("describe-db-instances", "DBInstances", "DBInstance", "StorageEncrypted"),
            ("describe-db-clusters", "DBClusters", "DBCluster", "StorageEncrypted"),
            ("describe-db-snapshots", "DBSnapshots", "DBSnapshot", "Encrypted"),
            ("describe-db-cluster-snapshots", "DBClusterSnapshots", "DBClusterSnapshot", "StorageEncrypted"),
        )
        for operation, collection, kind, encrypted_field in specs:
            def inspect(resource):
                name = self.required(resource, f"{kind}Identifier")
                arn = self.required(resource, f"{kind}Arn")
                encrypted = self.required(resource, encrypted_field, bool)
                if encrypted:
                    self.link(
                        self.required(resource, "KmsKeyId"), f"AWS::RDS::{kind}",
                        name, arn, "KmsKeyId",
                    )
                for prop in ("PerformanceInsightsKMSKeyId", "ActivityStreamKmsKeyId"):
                    if resource.get(prop):
                        self.link(resource[prop], f"AWS::RDS::{kind}", name, arn, prop)
                if resource.get("MasterUserSecret"):
                    secret = self.required(resource, "MasterUserSecret", dict)
                    if secret.get("KmsKeyId"):
                        self.link(
                            secret["KmsKeyId"], f"AWS::RDS::{kind}", name, arn,
                            "MasterUserSecret.KmsKeyId",
                        )
            try:
                self.scan_detailed(
                    "rds", operation, collection, inspect, request={"MaxRecords": 100},
                    response_token="Marker", request_token="Marker",
                )
            except ScanError as exc:
                self.result.record_error(f"RDS {operation}: {exc}")

    def scan_secrets(self):
        def inspect(secret):
            name = self.required(secret, "Name")
            arn = self.required(secret, "ARN")
            self.link(
                secret.get("KmsKeyId", "alias/aws/secretsmanager"),
                "AWS::SecretsManager::Secret", name, arn, "KmsKeyId",
            )
        self.scan_detailed(
            "secretsmanager", "list-secrets", "SecretList", inspect,
            request={"MaxResults": 100, "IncludePlannedDeletion": True},
        )

    def link_property(self, resource, path, resource_type, name, arn):
        value = resource
        for part in path.split("."):
            if not isinstance(value, dict):
                raise ScanError(f"Proprieta' non valida: {path}")
            if part not in value:
                return
            value = value[part]
        if value == "":
            return
        self.link(value, resource_type, name, arn, path)

    def scan_elasticache(self):
        def inspect(cache):
            self.link(
                self.required(cache, "KmsKeyId"), "AWS::ElastiCache::ServerlessCache",
                self.required(cache, "ServerlessCacheName"), self.required(cache, "ARN"),
                "KmsKeyId",
            )
        self.scan_detailed(
            "elasticache", "describe-serverless-caches", "ServerlessCaches", inspect,
            request={"MaxResults": 100},
        )

    def scan_opensearch(self):
        def inspect(domain):
            name = self.required(domain, "DomainName")
            status = self.required(self.client.call(
                "opensearch", "describe-domain", "--domain-name", name
            ), "DomainStatus", dict)
            encryption = self.required(status, "EncryptionAtRestOptions", dict)
            if self.required(encryption, "Enabled", bool):
                self.link(
                    self.required(encryption, "KmsKeyId"), "AWS::OpenSearchService::Domain",
                    name, self.required(status, "ARN"), "EncryptionAtRestOptions.KmsKeyId",
                )
        self.scan_detailed("opensearch", "list-domain-names", "DomainNames", inspect)

    def scan_efs(self):
        def inspect(filesystem):
            if self.required(filesystem, "Encrypted", bool):
                self.link(
                    self.required(filesystem, "KmsKeyId"), "AWS::EFS::FileSystem",
                    self.required(filesystem, "FileSystemId"),
                    self.required(filesystem, "FileSystemArn"), "KmsKeyId",
                )
        self.scan_detailed(
            "efs", "describe-file-systems", "FileSystems", inspect,
            request={"MaxItems": 100},
            response_token="NextMarker", request_token="Marker",
        )

    def scan_backup(self):
        def inspect_recovery_point(point):
            arn = self.required(point, "RecoveryPointArn")
            if self.required(point, "IsEncrypted", bool):
                if point.get("EncryptionKeyType") == "AWS_OWNED_KMS_KEY":
                    return
                self.link(
                    self.required(point, "EncryptionKeyArn"),
                    "AWS::Backup::RecoveryPoint", arn, arn, "EncryptionKeyArn",
                )

        def inspect_vault(vault):
            name = self.required(vault, "BackupVaultName")
            arn = self.required(vault, "BackupVaultArn")
            try:
                if vault.get("EncryptionKeyType") != "AWS_OWNED_KMS_KEY":
                    self.link(
                        self.required(vault, "EncryptionKeyArn"), "AWS::Backup::BackupVault",
                        name, arn, "EncryptionKeyArn",
                    )
            except ScanError as exc:
                self.result.record_error(f"AWS Backup vault {name}: {exc}")
            self.scan_detailed(
                "backup", "list-recovery-points-by-backup-vault", "RecoveryPoints",
                inspect_recovery_point, request={"BackupVaultName": name, "MaxResults": 100},
            )
        self.scan_detailed(
            "backup", "list-backup-vaults", "BackupVaultList", inspect_vault,
            request={"MaxResults": 100},
        )

    def scan_firehose(self):
        def inspect(name):
            if not isinstance(name, str) or not name:
                raise ScanError("Nome delivery stream non valido")
            request = {"DeliveryStreamName": name, "Limit": 100}
            seen_destinations = set()
            while True:
                stream = self.required(self.client.call(
                    "firehose", "describe-delivery-stream",
                    "--cli-input-json", json.dumps(request),
                ), "DeliveryStreamDescription", dict)
                arn = self.required(stream, "DeliveryStreamARN")
                self.link_property(
                    stream, "DeliveryStreamEncryptionConfiguration.KeyARN",
                    "AWS::KinesisFirehose::DeliveryStream", name, arn,
                )
                config = stream.get("DeliveryStreamEncryptionConfiguration", {})
                if (
                    isinstance(config, dict)
                    and config.get("KeyType") == "CUSTOMER_MANAGED_CMK"
                    and not config.get("KeyARN")
                ):
                    raise ScanError("Firehose: cifratura CMK senza KeyARN")
                destinations = self.required(stream, "Destinations", list)

                def inspect_destination(value, path):
                    if isinstance(value, dict):
                        for key, child in value.items():
                            child_path = f"{path}.{key}"
                            if key == "AWSKMSKeyARN":
                                self.link(
                                    child, "AWS::KinesisFirehose::DeliveryStream",
                                    name, arn, child_path,
                                )
                            else:
                                inspect_destination(child, child_path)
                    elif isinstance(value, list):
                        for index, child in enumerate(value):
                            inspect_destination(child, f"{path}[{index}]")

                for destination in destinations:
                    destination_id = self.required(destination, "DestinationId")
                    inspect_destination(destination, f"Destinations[{destination_id}]")
                if not self.required(stream, "HasMoreDestinations", bool):
                    break
                if not destinations or destination_id in seen_destinations:
                    raise ScanError("Firehose: cursore destinazioni assente o ripetuto")
                seen_destinations.add(destination_id)
                request["ExclusiveStartDestinationId"] = destination_id

        last_name = None
        seen_names = set()
        while True:
            request = {"Limit": 100}
            if last_name is not None:
                request["ExclusiveStartDeliveryStreamName"] = last_name
            response = self.client.call(
                "firehose", "list-delivery-streams",
                "--no-paginate", "--cli-input-json", json.dumps(request),
            )
            names = self.required(response, "DeliveryStreamNames", list)
            for name in names:
                self.result.resource_count += 1
                LOGGER.info("Firehose: verifica %s", name)
                try:
                    inspect(name)
                except ScanError as exc:
                    self.result.record_error(f"Firehose {name}: {exc}")
            if not self.required(response, "HasMoreDeliveryStreams", bool):
                break
            if (
                not names or not isinstance(names[-1], str)
                or not names[-1] or names[-1] in seen_names
            ):
                raise ScanError("Firehose: cursore stream assente o ripetuto")
            last_name = names[-1]
            seen_names.add(last_name)

    def scan_athena(self):
        def inspect(group):
            name = self.required(group, "Name")
            workgroup = self.required(self.client.call(
                "athena", "get-work-group", "--work-group", name
            ), "WorkGroup", dict)
            configuration = self.required(workgroup, "Configuration", dict)
            arn = (
                f"arn:{self.partition}:athena:{self.client.region}:"
                f"{self.account}:workgroup/{name}"
            )
            for path in (
                "ResultConfiguration.EncryptionConfiguration.KmsKey",
                "ManagedQueryResultsConfiguration.EncryptionConfiguration.KmsKey",
                "CustomerContentEncryptionConfiguration.KmsKey",
            ):
                self.link_property(configuration, path, "AWS::Athena::WorkGroup", name, arn)
            if "ResultConfiguration" in configuration:
                results = self.required(configuration, "ResultConfiguration", dict)
                if "EncryptionConfiguration" in results:
                    encryption = self.required(results, "EncryptionConfiguration", dict)
                    if encryption.get("EncryptionOption") in ("SSE_KMS", "CSE_KMS"):
                        self.required(encryption, "KmsKey")
        self.scan_detailed(
            "athena", "list-work-groups", "WorkGroups", inspect, request={"MaxResults": 50},
        )

    def scan_lambda(self):
        def inspect(function):
            name = self.required(function, "FunctionName")
            arn = self.required(function, "FunctionArn")
            version = self.required(function, "Version")
            versioned_arn = arn if arn.endswith(f":{version}") else f"{arn}:{version}"
            self.link_property(
                function, "KMSKeyArn", "AWS::Lambda::Function", name, versioned_arn,
            )
            response = self.client.call(
                "lambda", "get-function", "--function-name", versioned_arn,
            )
            configuration = self.required(response, "Configuration", dict)
            self.link_property(
                configuration, "KMSKeyArn", "AWS::Lambda::Function", name, versioned_arn,
            )
            code = self.required(response, "Code", dict)
            self.link_property(
                code, "SourceKMSKeyArn", "AWS::Lambda::Function", name, versioned_arn,
            )
        self.scan_detailed(
            "lambda", "list-functions", "Functions", inspect,
            request={"MaxItems": 50, "FunctionVersion": "ALL"},
            response_token="NextMarker", request_token="Marker",
        )

    def scan_codebuild(self):
        def inspect(name):
            if not isinstance(name, str) or not name:
                raise ScanError("Nome progetto CodeBuild non valido")
            response = self.client.call("codebuild", "batch-get-projects", "--names", name)
            projects = self.required(response, "projects", list)
            if response.get("projectsNotFound") or len(projects) != 1:
                raise ScanError(f"CodeBuild: progetto non recuperato: {name}")
            project = projects[0]
            arn = self.required(project, "arn")
            self.link_property(project, "encryptionKey", "AWS::CodeBuild::Project", name, arn)
        self.scan_detailed(
            "codebuild", "list-projects", "projects", inspect,
            response_token="nextToken", request_token="nextToken",
        )

    def scan_eventbridge(self):
        def inspect(bus):
            name = self.required(bus, "Name")
            detail = self.client.call("events", "describe-event-bus", "--name", name)
            self.link_property(
                detail, "KmsKeyIdentifier", "AWS::Events::EventBus",
                name, self.required(detail, "Arn"),
            )
        self.scan_detailed(
            "events", "list-event-buses", "EventBuses", inspect, request={"Limit": 100},
        )

    def scan_cloudtrail(self):
        def inspect(trail):
            if self.required(trail, "HomeRegion") != self.client.region:
                return
            arn = self.required(trail, "TrailARN")
            detail = self.required(self.client.call(
                "cloudtrail", "get-trail", "--name", arn
            ), "Trail", dict)
            self.link_property(
                detail, "KmsKeyId", "AWS::CloudTrail::Trail",
                self.required(detail, "Name"), arn,
            )
        self.scan_detailed("cloudtrail", "list-trails", "Trails", inspect)

    def scan_elasticache_managed(self):
        def inspect_group(group):
            if self.required(group, "AtRestEncryptionEnabled", bool):
                # Senza KmsKeyId la cifratura usa la chiave di default di AWS.
                self.link_property(
                    group, "KmsKeyId", "AWS::ElastiCache::ReplicationGroup",
                    self.required(group, "ReplicationGroupId"), self.required(group, "ARN"),
                )

        def inspect_snapshot(snapshot):
            self.link_property(
                snapshot, "KmsKeyId", "AWS::ElastiCache::Snapshot",
                self.required(snapshot, "SnapshotName"), self.required(snapshot, "ARN"),
            )

        def inspect_serverless_snapshot(snapshot):
            self.link_property(
                snapshot, "KmsKeyId", "AWS::ElastiCache::ServerlessCacheSnapshot",
                self.required(snapshot, "ServerlessCacheSnapshotName"),
                self.required(snapshot, "ARN"),
            )

        specs = (
            ("describe-replication-groups", "ReplicationGroups", inspect_group,
             {"MaxRecords": 100}, "Marker"),
            ("describe-snapshots", "Snapshots", inspect_snapshot,
             {"MaxRecords": 50}, "Marker"),
            ("describe-serverless-cache-snapshots", "ServerlessCacheSnapshots",
             inspect_serverless_snapshot, {"MaxResults": 50}, "NextToken"),
        )
        for operation, collection, inspect, request, token in specs:
            try:
                self.scan_detailed(
                    "elasticache", operation, collection, inspect, request=request,
                    response_token=token, request_token=token,
                )
            except ScanError as exc:
                self.result.record_error(f"ElastiCache {operation}: {exc}")

    def ec2_arn(self, resource, identifier, with_account=True):
        account = self.account if with_account else ""
        return (
            f"arn:{self.partition}:ec2:{self.client.region}:{account}:"
            f"{resource}/{identifier}"
        )

    def link_block_devices(self, mappings, resource_type, name, arn, path):
        if mappings is None:
            return
        if not isinstance(mappings, list):
            raise ScanError(f"{path} non valido")
        for index, mapping in enumerate(mappings):
            if not isinstance(mapping, dict):
                raise ScanError(f"{path}[{index}] non valido")
            ebs = mapping.get("Ebs")
            if ebs is None:
                continue
            if not isinstance(ebs, dict):
                raise ScanError(f"{path}[{index}].Ebs non valido")
            if ebs.get("KmsKeyId"):
                device = mapping.get("DeviceName") or str(index)
                self.link(
                    ebs["KmsKeyId"], resource_type, name, arn,
                    f"{path}[{device}].Ebs.KmsKeyId",
                )

    def scan_ec2(self):
        def default_key():
            enabled = self.required(self.client.call(
                "ec2", "get-ebs-encryption-by-default"
            ), "EbsEncryptionByDefault", bool)
            key = self.required(self.client.call(
                "ec2", "get-ebs-default-kms-key-id"
            ), "KmsKeyId")
            self.result.resource_count += 1
            self.link(
                key, "AWS::EC2::EBSDefaultEncryption",
                f"{self.account}/{self.client.region}",
                f"arn:{self.partition}:ec2:{self.client.region}:{self.account}:ebs-default",
                f"KmsKeyId (EbsEncryptionByDefault={str(enabled).lower()})",
            )

        def inspect_volume(volume):
            volume_id = self.required(volume, "VolumeId")
            if self.required(volume, "Encrypted", bool):
                self.link(
                    self.required(volume, "KmsKeyId"), "AWS::EC2::Volume",
                    volume_id, self.ec2_arn("volume", volume_id), "KmsKeyId",
                )

        def inspect_snapshot(snapshot):
            snapshot_id = self.required(snapshot, "SnapshotId")
            if self.required(snapshot, "Encrypted", bool):
                self.link(
                    self.required(snapshot, "KmsKeyId"), "AWS::EC2::Snapshot",
                    snapshot_id, self.ec2_arn("snapshot", snapshot_id, False), "KmsKeyId",
                )

        def inspect_image(image):
            image_id = self.required(image, "ImageId")
            self.link_block_devices(
                image.get("BlockDeviceMappings"), "AWS::EC2::Image", image_id,
                self.ec2_arn("image", image_id, False), "BlockDeviceMappings",
            )

        def inspect_template(template):
            template_id = self.required(template, "LaunchTemplateId")
            name = self.required(template, "LaunchTemplateName")
            arn = self.ec2_arn("launch-template", template_id)

            def inspect_version(version):
                data = version.get("LaunchTemplateData") or {}
                if not isinstance(data, dict):
                    raise ScanError("LaunchTemplateData non valido")
                number = self.required(version, "VersionNumber", int)
                self.link_block_devices(
                    data.get("BlockDeviceMappings"), "AWS::EC2::LaunchTemplate",
                    f"{name}:v{number}", arn, "LaunchTemplateData.BlockDeviceMappings",
                )

            self.scan_detailed(
                "ec2", "describe-launch-template-versions", "LaunchTemplateVersions",
                inspect_version, request={
                    "LaunchTemplateId": template_id,
                    "Versions": ["$Default", "$Latest"], "MaxResults": 100,
                },
            )

        try:
            default_key()
        except ScanError as exc:
            self.result.record_error(f"EC2 cifratura EBS di default: {exc}")
        specs = (
            ("describe-volumes", "Volumes", inspect_volume, {"MaxResults": 500}),
            ("describe-snapshots", "Snapshots", inspect_snapshot,
             {"OwnerIds": ["self"], "MaxResults": 1000}),
            ("describe-images", "Images", inspect_image, {
                "Owners": ["self"], "IncludeDeprecated": True,
                "IncludeDisabled": True, "MaxResults": 1000,
            }),
            ("describe-launch-templates", "LaunchTemplates", inspect_template,
             {"MaxResults": 200}),
        )
        for operation, collection, inspect, request in specs:
            try:
                self.scan_detailed("ec2", operation, collection, inspect, request=request)
            except ScanError as exc:
                self.result.record_error(f"EC2 {operation}: {exc}")

    def scan_ses(self):
        def inspect_receipt_rule_set(rule_set):
            name = self.required(rule_set, "Name")
            rules = self.client.call(
                "ses", "describe-receipt-rule-set", "--rule-set-name", name
            ).get("Rules", [])
            if not isinstance(rules, list):
                raise ScanError("Rules non valido")
            base_arn = (
                f"arn:{self.partition}:ses:{self.client.region}:{self.account}:"
                f"receipt-rule-set/{name}"
            )
            for rule in rules:
                rule_name = self.required(rule, "Name")
                actions = rule.get("Actions", [])
                if not isinstance(actions, list):
                    raise ScanError(f"Actions non valido per la regola {rule_name}")
                for action in actions:
                    if not isinstance(action, dict):
                        raise ScanError(f"Azione non valida per la regola {rule_name}")
                    self.link_property(
                        action, "S3Action.KmsKeyArn", "AWS::SES::ReceiptRule",
                        f"{name}/{rule_name}", f"{base_arn}:receipt-rule/{rule_name}",
                    )

        def inspect_archive(archive):
            archive_id = self.required(archive, "ArchiveId")
            detail = self.client.call(
                "mailmanager", "get-archive", "--archive-id", archive_id
            )
            self.link_property(
                detail, "KmsKeyArn", "AWS::SES::MailManagerArchive",
                detail.get("ArchiveName") or archive_id, self.required(detail, "ArchiveArn"),
            )

        def inspect_rule_set(rule_set):
            rule_set_id = self.required(rule_set, "RuleSetId")
            detail = self.client.call(
                "mailmanager", "get-rule-set", "--rule-set-id", rule_set_id
            )
            arn = self.required(detail, "RuleSetArn")
            rule_set_name = detail.get("RuleSetName") or rule_set_id
            rules = detail.get("Rules", [])
            if not isinstance(rules, list):
                raise ScanError("Rules non valido")
            for index, rule in enumerate(rules):
                if not isinstance(rule, dict):
                    raise ScanError(f"Regola {index} non valida")
                rule_name = rule.get("Name") or str(index)
                actions = rule.get("Actions", [])
                if not isinstance(actions, list):
                    raise ScanError(f"Actions non valido per la regola {rule_name}")
                for action in actions:
                    if not isinstance(action, dict):
                        raise ScanError(f"Azione non valida per la regola {rule_name}")
                    self.link_property(
                        action, "WriteToS3.S3SseKmsKeyId", "AWS::SES::MailManagerRuleSet",
                        f"{rule_set_name}/{rule_name}", arn,
                    )

        specs = (
            ("ses", "list-receipt-rule-sets", "RuleSets", inspect_receipt_rule_set, {}),
            ("mailmanager", "list-archives", "Archives", inspect_archive, {"PageSize": 50}),
            ("mailmanager", "list-rule-sets", "RuleSets", inspect_rule_set, {"PageSize": 50}),
        )
        for service, operation, collection, inspect, request in specs:
            try:
                self.scan_detailed(service, operation, collection, inspect, request=request)
            except ScanError as exc:
                self.result.record_error(f"SES {service} {operation}: {exc}")

    def run_independent(self, label, steps):
        for name, step in steps:
            try:
                step()
            except ScanError as exc:
                self.result.record_error(f"{label} {name}: {exc}")

    def scan_ssm(self):
        def inspect(parameter):
            self.link(
                parameter.get("KeyId") or "alias/aws/ssm", "AWS::SSM::Parameter",
                self.required(parameter, "Name"), self.required(parameter, "ARN"), "KeyId",
            )
        self.scan_detailed(
            "ssm", "describe-parameters", "Parameters", inspect, request={
                "ParameterFilters": [{"Key": "Type", "Values": ["SecureString"]}],
                "MaxResults": 50,
            },
        )

    def scan_ecr(self):
        def link_encryption(resource, resource_type, name, arn):
            config = resource.get("encryptionConfiguration")
            if config is None:
                return
            if not isinstance(config, dict):
                raise ScanError("encryptionConfiguration non valido")
            if self.required(config, "encryptionType") in ("KMS", "KMS_DSSE"):
                self.link(
                    config.get("kmsKey") or "alias/aws/ecr", resource_type, name, arn,
                    "encryptionConfiguration.kmsKey",
                )

        def inspect_repository(repository):
            link_encryption(
                repository, "AWS::ECR::Repository",
                self.required(repository, "repositoryName"),
                self.required(repository, "repositoryArn"),
            )

        def inspect_template(template):
            prefix = self.required(template, "prefix")
            link_encryption(
                template, "AWS::ECR::RepositoryCreationTemplate", prefix,
                f"arn:{self.partition}:ecr:{self.client.region}:{self.account}:"
                f"repository-creation-template/{prefix}",
            )

        tokens = {"response_token": "nextToken", "request_token": "nextToken"}
        self.run_independent("ECR", (
            ("describe-repositories", lambda: self.scan_detailed(
                "ecr", "describe-repositories", "repositories", inspect_repository,
                request={"maxResults": 1000}, **tokens,
            )),
            ("describe-repository-creation-templates", lambda: self.scan_detailed(
                "ecr", "describe-repository-creation-templates",
                "repositoryCreationTemplates", inspect_template,
                request={"maxResults": 1000}, **tokens,
            )),
        ))

    def link_stepfunctions(self, detail, resource_type, name, arn):
        config = detail.get("encryptionConfiguration")
        if config is None:
            return
        if not isinstance(config, dict):
            raise ScanError("encryptionConfiguration non valido")
        if self.required(config, "type") == "CUSTOMER_MANAGED_KMS_KEY":
            self.link(
                self.required(config, "kmsKeyId"), resource_type, name, arn,
                "encryptionConfiguration.kmsKeyId",
            )

    def scan_stepfunctions(self):
        def inspect_state_machine(item):
            arn = self.required(item, "stateMachineArn")
            # METADATA_ONLY evita di decifrare la definizione con la chiave.
            detail = self.client.call(
                "stepfunctions", "describe-state-machine", "--state-machine-arn", arn,
                "--included-data", "METADATA_ONLY",
            )
            self.link_stepfunctions(
                detail, "AWS::StepFunctions::StateMachine",
                self.required(item, "name"), arn,
            )

        def inspect_activity(item):
            arn = self.required(item, "activityArn")
            detail = self.client.call(
                "stepfunctions", "describe-activity", "--activity-arn", arn
            )
            self.link_stepfunctions(
                detail, "AWS::StepFunctions::Activity", self.required(item, "name"), arn,
            )

        tokens = {"response_token": "nextToken", "request_token": "nextToken"}
        self.run_independent("Step Functions", (
            ("list-state-machines", lambda: self.scan_detailed(
                "stepfunctions", "list-state-machines", "stateMachines",
                inspect_state_machine, request={"maxResults": 1000}, **tokens,
            )),
            ("list-activities", lambda: self.scan_detailed(
                "stepfunctions", "list-activities", "activities",
                inspect_activity, request={"maxResults": 1000}, **tokens,
            )),
        ))

    def scan_codepipeline(self):
        def inspect(item):
            name = self.required(item, "name")
            response = self.client.call("codepipeline", "get-pipeline", "--name", name)
            pipeline = self.required(response, "pipeline", dict)
            arn = (
                f"arn:{self.partition}:codepipeline:{self.client.region}:"
                f"{self.account}:{name}"
            )
            metadata = response.get("metadata")
            if isinstance(metadata, dict) and isinstance(metadata.get("pipelineArn"), str):
                arn = metadata["pipelineArn"]
            stores = [("artifactStore", pipeline.get("artifactStore"))]
            regional = pipeline.get("artifactStores") or {}
            if not isinstance(regional, dict):
                raise ScanError("artifactStores non valido")
            stores += [(f"artifactStores.{region}", store) for region, store in sorted(regional.items())]
            for path, store in stores:
                if store is None:
                    continue
                if not isinstance(store, dict):
                    raise ScanError(f"{path} non valido")
                self.link_property(
                    store, "encryptionKey.id", "AWS::CodePipeline::Pipeline", name, arn,
                )
        self.scan_detailed(
            "codepipeline", "list-pipelines", "pipelines", inspect,
            request={"maxResults": 1000},
            response_token="nextToken", request_token="nextToken",
        )

    def scan_ecs(self):
        def inspect(cluster_arn):
            if not isinstance(cluster_arn, str) or not cluster_arn:
                raise ScanError("ARN cluster non valido")
            response = self.client.call(
                "ecs", "describe-clusters", "--clusters", cluster_arn,
                "--include", "CONFIGURATIONS",
            )
            clusters = self.required(response, "clusters", list)
            if len(clusters) != 1:
                raise ScanError(f"Cluster non restituito: {response.get('failures')}")
            cluster = clusters[0]
            name = self.required(cluster, "clusterName")
            for path in (
                "configuration.executeCommandConfiguration.kmsKeyId",
                "configuration.managedStorageConfiguration.kmsKeyId",
                "configuration.managedStorageConfiguration.fargateEphemeralStorageKmsKeyId",
            ):
                self.link_property(cluster, path, "AWS::ECS::Cluster", name, cluster_arn)
        self.scan_detailed(
            "ecs", "list-clusters", "clusterArns", inspect, request={"maxResults": 100},
            response_token="nextToken", request_token="nextToken",
        )

    def scan_cognito(self):
        def inspect(item):
            pool_id = self.required(item, "Id")
            pool = self.required(self.client.call(
                "cognito-idp", "describe-user-pool", "--user-pool-id", pool_id
            ), "UserPool", dict)
            self.link_property(
                pool, "LambdaConfig.KMSKeyID", "AWS::Cognito::UserPool",
                self.required(pool, "Name"), self.required(pool, "Arn"),
            )
        self.scan_detailed(
            "cognito-idp", "list-user-pools", "UserPools", inspect,
            request={"MaxResults": 60},
        )

    def scan_glue(self):
        catalog_arn = f"arn:{self.partition}:glue:{self.client.region}:{self.account}:catalog"

        def catalog():
            settings = self.required(self.client.call(
                "glue", "get-data-catalog-encryption-settings"
            ), "DataCatalogEncryptionSettings", dict)
            self.result.resource_count += 1
            at_rest = settings.get("EncryptionAtRest") or {}
            if not isinstance(at_rest, dict):
                raise ScanError("EncryptionAtRest non valido")
            if at_rest.get("CatalogEncryptionMode", "DISABLED") != "DISABLED":
                self.link(
                    self.required(at_rest, "SseAwsKmsKeyId"), "AWS::Glue::DataCatalog",
                    self.account, catalog_arn, "EncryptionAtRest.SseAwsKmsKeyId",
                )
            self.link_property(
                settings, "ConnectionPasswordEncryption.AwsKmsKeyId",
                "AWS::Glue::DataCatalog", self.account, catalog_arn,
            )

        def inspect(configuration):
            name = self.required(configuration, "Name")
            arn = (
                f"arn:{self.partition}:glue:{self.client.region}:{self.account}:"
                f"securityConfiguration/{name}"
            )
            encryption = self.required(configuration, "EncryptionConfiguration", dict)
            s3 = encryption.get("S3Encryption") or []
            if not isinstance(s3, list):
                raise ScanError("S3Encryption non valido")
            for entry in s3:
                if not isinstance(entry, dict):
                    raise ScanError("S3Encryption non valido")
                self.link_property(
                    {"S3Encryption": entry}, "S3Encryption.KmsKeyArn",
                    "AWS::Glue::SecurityConfiguration", name, arn,
                )
            for section in ("CloudWatchEncryption", "JobBookmarksEncryption", "DataQualityEncryption"):
                self.link_property(
                    encryption, f"{section}.KmsKeyArn",
                    "AWS::Glue::SecurityConfiguration", name, arn,
                )

        self.run_independent("Glue", (
            ("get-data-catalog-encryption-settings", catalog),
            ("get-security-configurations", lambda: self.scan_detailed(
                "glue", "get-security-configurations", "SecurityConfigurations",
                # Il servizio accetta al massimo 200, anche se il modello CLI indica 1000.
                inspect, request={"MaxResults": 100},
            )),
        ))

    def scan_xray(self):
        config = self.required(
            self.client.call("xray", "get-encryption-config"), "EncryptionConfig", dict
        )
        self.result.resource_count += 1
        if config.get("Type") == "KMS":
            self.link(
                self.required(config, "KeyId"), "AWS::XRay::EncryptionConfig",
                f"{self.account}/{self.client.region}",
                f"arn:{self.partition}:xray:{self.client.region}:{self.account}:encryption-config",
                "KeyId",
            )

    def scan_quicksight(self):
        try:
            response = self.client.call(
                "quicksight", "describe-key-registration", "--aws-account-id", self.account
            )
        except ScanError as exc:
            if "ResourceNotFoundException" in str(exc):
                LOGGER.info("QuickSight non attivo nell'account: nessuna chiave registrata")
                return
            raise
        self.result.resource_count += 1
        keys = response.get("KeyRegistration", [])
        if not isinstance(keys, list):
            raise ScanError("KeyRegistration non valido")
        for key in keys:
            self.link(
                self.required(key, "KeyArn"), "AWS::QuickSight::KeyRegistration",
                self.account,
                f"arn:{self.partition}:quicksight:{self.client.region}:{self.account}:"
                "key-registration",
                "KeyRegistration.KeyArn",
            )

    def scan(self):
        scans = (
            self.scan_kinesis, self.scan_s3, self.scan_dynamodb,
            self.scan_sqs, self.scan_sns, self.scan_rds, self.scan_secrets,
            self.scan_elasticache, self.scan_opensearch, self.scan_efs,
            self.scan_backup, self.scan_firehose, self.scan_athena,
            self.scan_lambda, self.scan_codebuild, self.scan_eventbridge,
            self.scan_cloudtrail, self.scan_elasticache_managed, self.scan_ec2,
            self.scan_ses, self.scan_ssm, self.scan_ecr, self.scan_stepfunctions,
            self.scan_codepipeline, self.scan_ecs, self.scan_cognito,
            self.scan_glue, self.scan_xray, self.scan_quicksight,
        )
        for scan in scans:
            started = time.monotonic()
            LOGGER.info("Avvio %s", scan.__name__)
            try:
                scan()
            except ScanError as exc:
                self.result.record_error(f"{scan.__name__}: {exc}")
            LOGGER.info("%s completata in %.2fs", scan.__name__, time.monotonic() - started)
        return self.result


def scan_resources(client, key_arns, account, partition):
    result = scan_cloudwatch_logs(client, key_arns)
    other = ResourceScanner(client, key_arns, account, partition).scan()
    for arn, associations in other.associations.items():
        result.associations[arn].update(associations)
    result.errors.extend(other.errors)
    result.resource_count += other.resource_count
    return result


def write_reports(keys, key_arns, result, output, summary, account, region):
    scope = {
        "AccountId": account,
        "Region": region,
        "CheckedServices": "; ".join(CHECKED_SERVICES),
        "CheckedAt": datetime.now(timezone.utc).isoformat(),
        "ScanComplete": str(not result.errors).lower(),
        "ScanErrors": " | ".join(result.errors),
    }
    totals: dict[str, Counter[str]] = defaultdict(Counter)
    with output.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=REPORT_FIELDS)
        writer.writeheader()
        for key in sorted(keys, key=lambda item: (item.microservice, item.key_id)):
            arn = key_arns[key.key_id]
            status = result.status(arn)
            associations = result.associations.get(arn, set())
            stats = totals[key.microservice]
            stats["TotalKeys"] += 1
            count_field = {
                "ASSOCIATED": "AssociatedKeys",
                "NO_ASSOCIATION_FOUND": "NoAssociationFoundKeys",
                "SCAN_INCOMPLETE": "ScanIncompleteKeys",
            }[status]
            stats[count_field] += 1
            stats["Associations"] += len(associations)
            base = {
                **key.csv_values(), "Microservice": key.microservice,
                "KeyArn": arn, "Status": status, **scope,
            }
            if not associations:
                writer.writerow(base)
            for association in sorted(
                associations,
                key=lambda item: (
                    item.resource_type, item.resource_name, item.resource_arn,
                    item.property_name, item.key_reference,
                ),
            ):
                writer.writerow({
                    **base,
                    "ResourceType": association.resource_type,
                    "ResourceName": association.resource_name,
                    "ResourceArn": association.resource_arn,
                    "Property": association.property_name,
                    "KeyReference": association.key_reference,
                })
    with summary.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=SUMMARY_FIELDS)
        writer.writeheader()
        for service, stats in sorted(totals.items()):
            writer.writerow({
                **{name: stats[name] for name in SUMMARY_FIELDS[1:6]},
                "Microservice": service, **scope,
            })
            LOGGER.info(
                "%s: %d chiavi, %d associate, %d senza match, "
                "%d non verificabili, %d associazioni",
                service, stats["TotalKeys"], stats["AssociatedKeys"],
                stats["NoAssociationFoundKeys"], stats["ScanIncompleteKeys"],
                stats["Associations"],
            )



NO_TAG = "noTag"
MIN_KEY_AGE_DAYS = 30
PENDING_WINDOW_DAYS = 30
ACTION_FIELDS = (
    "Mode", "Microservice", "KeyId", "KeyArn", "Alias", "Outcome", "Reason",
    "creation_date", "last_usage_date", "Applied", "CheckedAt", "AccountId", "Region",
)
DESCRIBE_KEY = ("kms", "describe-key")


@dataclass(frozen=True)
class KeyAction:
    """Modalita' che modifica lo stato delle chiavi KMS."""

    mode: str
    operation: str
    candidate: str
    done: str
    verb: str
    source: tuple[str, str] | None = None  # (Mode, Outcome) letti dal CSV esiti
    reads: frozenset = frozenset()

    def operations(self, apply):
        """Operazioni AWS extra concesse al client: la scrittura solo con --apply."""
        return self.reads | ({("kms", self.operation)} if apply else set())


ACTIONS = {
    action.mode: action for action in (
        KeyAction("disableKMS", "disable-key", "DISABLE_CANDIDATE", "DISABLED",
                  "DISABILITATE"),
        KeyAction("enableKMS", "enable-key", "ENABLE_CANDIDATE", "ENABLED",
                  "RIABILITATE", ("disableKMS", "DISABLED")),
        KeyAction("deleteKMS", "schedule-key-deletion", "DELETE_CANDIDATE",
                  "DELETION_SCHEDULED", "PROGRAMMATE PER L'ELIMINAZIONE",
                  ("disableKMS", "DISABLED"), frozenset({DESCRIBE_KEY})),
        KeyAction("cancelDeleteKMS", "cancel-key-deletion", "CANCEL_CANDIDATE",
                  "DELETION_CANCELLED", "RIPRISTINATE (eliminazione annullata)",
                  ("deleteKMS", "DELETION_SCHEDULED")),
    )
}


def microservice_label(value):
    return MISSING_MICROSERVICE if value == NO_TAG else value


def parse_date(value):
    parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def load_disable_candidates(report_path, microservice):
    label = microservice_label(microservice)
    keys = {}
    scopes = set()
    with report_path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames is None or list(reader.fieldnames) != list(REPORT_FIELDS):
            raise ValueError("Il file non e' un report completo di manage_kms_keys")
        for row in reader:
            if None in row or any(value is None for value in row.values()):
                raise ValueError(f"Report riga {reader.line_num}: numero colonne errato")
            if row["ScanComplete"] != "true":
                raise ValueError(
                    f"Report riga {reader.line_num}: scansione incompleta, "
                    "rigenerare il report prima di disabilitare chiavi"
                )
            scopes.add((row["AccountId"], row["Region"]))
            if row["Microservice"] != label:
                continue
            arn = row["KeyArn"]
            if not KEY_ARN_PATTERN.fullmatch(arn) or not arn.endswith("/" + row["id"]):
                raise ValueError(f"Report riga {reader.line_num}: KeyArn non valido")
            entry = keys.setdefault(arn, {
                "key_id": row["id"], "alias": row["alias"],
                "creation_date": row["creation_date"],
                "last_usage_date": row["last_usage_date"],
                "statuses": set(), "resources": set(),
            })
            entry["statuses"].add(row["Status"])
            if row["ResourceType"]:
                entry["resources"].add(row["ResourceType"])
    if len(scopes) != 1:
        raise ValueError("Report vuoto o con account/regione multipli")
    account, region = scopes.pop()
    if region != REGION:
        raise ValueError(f"Report generato per la regione {region}, attesa {REGION}")
    if not keys:
        raise ValueError(f"Nessuna chiave nel report per Microservice={microservice}")
    LOGGER.info("Report: %d chiavi per %s", len(keys), microservice)
    return keys, account


def date_attention(entry, now, min_age_days):
    """Motivi per cui la chiave va attenzionata secondo le date del report."""
    reasons = []
    if entry["last_usage_date"].strip():
        reasons.append(f"ultimo utilizzo nel report: {entry['last_usage_date'].strip()}")
    try:
        age_days = (now - parse_date(entry["creation_date"])).total_seconds() / 86400
    except (ValueError, AttributeError):
        reasons.append("creation_date assente o non valida nel report")
    else:
        if age_days < min_age_days:
            reasons.append(f"creata da {max(int(age_days), 0)} giorni (< {min_age_days})")
    return reasons


def confirm(expected, prompt=input):
    try:
        answer = prompt(f"Digitare '{expected}' per confermare l'operazione: ")
    except EOFError:
        return False
    return answer.strip() == expected


def write_actions(path, rows):
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=ACTION_FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({name: row.get(name, "") for name in ACTION_FIELDS})


def precheck_row(client, row, precheck):
    """True se la riga puo' procedere; altrimenti la marca SKIPPED o ERROR."""
    try:
        blocked = precheck(client, row)
    except ScanError as exc:
        row.update(Outcome="ERROR", Reason=f"verifica stato: {exc}")
        return False
    if blocked:
        row.update(Outcome="SKIPPED", Reason=blocked)
        return False
    return True


def apply_changes(client, rows, action, microservice, account, prompt,
                  extra=None, precheck=None):
    """Esegue l'operazione della modalita' sulle righe, dopo conferma digitata."""
    LOGGER.warning(
        "Stanno per essere %s %d chiavi KMS di %s nell'account %s",
        action.verb, len(rows), microservice, account,
    )
    if not confirm(microservice, prompt):
        raise ValueError("Conferma non corrispondente: nessuna modifica eseguita")
    for index, row in enumerate(rows, 1):
        # La verifica e' ripetuta subito prima della scrittura.
        if precheck is None or precheck_row(client, row, precheck):
            try:
                response = client.call(
                    "kms", action.operation, "--cli-input-json",
                    json.dumps({"KeyId": row["KeyArn"], **(extra or {})}),
                )
            except ScanError as exc:
                row.update(Outcome="ERROR", Reason=f"{action.operation}: {exc}")
            else:
                row.update(Outcome=action.done, Applied="true")
                if "DeletionDate" in response:
                    row["Reason"] = f"eliminazione programmata il {response['DeletionDate']}"
        log = LOGGER.info if row["Outcome"] == action.done else LOGGER.warning
        log("%s %d/%d: %s -> %s", action.operation, index, len(rows),
            row["KeyArn"], row["Outcome"])


def execute(client, rows, action, apply, microservice, account, output, prompt,
            extra=None, precheck=None):
    """Verifica, dry-run o applicazione; il CSV esiti e' scritto sempre."""
    try:
        if precheck:
            for index, row in enumerate(rows, 1):
                if row["Outcome"] == action.candidate and not precheck_row(
                    client, row, precheck
                ):
                    LOGGER.warning("Verifica %d/%d: %s -> %s: %s", index, len(rows),
                                   row["KeyArn"], row["Outcome"], row["Reason"])
        candidates = [row for row in rows if row["Outcome"] == action.candidate]
        LOGGER.info(
            "Esiti: %s", dict(sorted(Counter(row["Outcome"] for row in rows).items())),
        )
        if not apply:
            LOGGER.info(
                "Dry-run: %d chiavi candidate a %s, nessuna modifica eseguita "
                "(usare --apply per procedere)", len(candidates), action.operation,
            )
        elif candidates:
            apply_changes(client, candidates, action, microservice, account, prompt,
                          extra, precheck)
        else:
            LOGGER.info("Nessuna chiave su cui eseguire %s", action.operation)
        return rows
    finally:
        write_actions(output, rows)
        LOGGER.info("Esiti scritti in %s", output)


def check_account(client, expected):
    account, _ = get_account(client)
    if account != expected:
        raise ValueError(f"File dell'account {expected}, profilo sull'account {account}")
    return account


def run_disable(client, report_path, microservice, output, apply,
                min_age_days=MIN_KEY_AGE_DAYS, prompt=input):
    keys, report_account = load_disable_candidates(report_path, microservice)
    account = check_account(client, report_account)
    now = datetime.now(timezone.utc)
    rows = []
    for arn, entry in sorted(keys.items()):
        row = {
            "Mode": "disableKMS", "Microservice": microservice,
            "KeyId": entry["key_id"], "KeyArn": arn, "Alias": entry["alias"],
            "creation_date": entry["creation_date"],
            "last_usage_date": entry["last_usage_date"], "Applied": "false",
            "CheckedAt": now.isoformat(), "AccountId": account, "Region": REGION,
        }
        reasons = date_attention(entry, now, min_age_days)
        if entry["statuses"] != {"NO_ASSOCIATION_FOUND"}:
            row.update(Outcome="SKIPPED", Reason="associata a risorse: "
                       + ", ".join(sorted(entry["resources"])))
        elif reasons:
            row.update(Outcome="ATTENTION", Reason="; ".join(reasons))
            LOGGER.warning("%s -> ATTENTION: %s", arn, row["Reason"])
        else:
            row.update(Outcome="DISABLE_CANDIDATE", Reason=(
                f"nessuna associazione, nessun utilizzo, creata da oltre {min_age_days} giorni"
            ))
        rows.append(row)
    return execute(client, rows, ACTIONS["disableKMS"], apply, microservice,
                   account, output, prompt)


def load_actions(actions_path, action):
    """Legge il CSV esiti della modalita' sorgente: (righe, microservizio, account)."""
    source_mode, outcome = action.source
    with actions_path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames is None or list(reader.fieldnames) != list(ACTION_FIELDS):
            raise ValueError(f"Il file non e' un esito di {source_mode}")
        source = list(reader)
    if not source or any(row["Mode"] != source_mode for row in source):
        raise ValueError(f"Il file non contiene esiti di {source_mode}")
    services = {row["Microservice"] for row in source}
    accounts = {row["AccountId"] for row in source}
    if len(services) != 1 or len(accounts) != 1:
        raise ValueError("Esiti con microservizi o account multipli")
    selected = [row for row in source if row["Outcome"] == outcome]
    if not selected:
        raise ValueError(f"Nessuna chiave con esito {outcome} nel file")
    LOGGER.info("Esiti %s: %d chiavi con esito %s", source_mode, len(selected), outcome)
    return selected, services.pop(), accounts.pop()


def run_from_actions(client, action, actions_path, output, apply, reason, prompt=input,
                     extra=None, precheck=None):
    source, microservice, expected = load_actions(actions_path, action)
    account = check_account(client, expected)
    now = datetime.now(timezone.utc).isoformat()
    rows = [
        {**row, "Mode": action.mode, "Outcome": action.candidate, "Reason": reason,
         "Applied": "false", "CheckedAt": now}
        for row in source
    ]
    return execute(client, rows, action, apply, microservice, account, output, prompt,
                   extra, precheck)


def run_enable(client, actions_path, output, apply, prompt=input):
    return run_from_actions(client, ACTIONS["enableKMS"], actions_path, output, apply,
                            "disabilitata da disableKMS", prompt)


def require_disabled(client, row):
    """Motivo di blocco se `aws kms describe-key` non riporta una CMK Disabled."""
    metadata = client.call(
        *DESCRIBE_KEY, "--key-id", row["KeyArn"],
    ).get("KeyMetadata", {})
    if metadata.get("KeyManager") != "CUSTOMER":
        return f"chiave non gestita dal cliente ({metadata.get('KeyManager')})"
    if metadata.get("KeyState") != "Disabled":
        return f"KeyState={metadata.get('KeyState')}, attesa Disabled"
    return None


def run_delete(client, actions_path, output, apply, pending_days=PENDING_WINDOW_DAYS,
               prompt=input):
    return run_from_actions(
        client, ACTIONS["deleteKMS"], actions_path, output, apply,
        f"KeyState=Disabled verificato; attesa {pending_days} giorni", prompt,
        extra={"PendingWindowInDays": pending_days}, precheck=require_disabled,
    )


def run_cancel_delete(client, actions_path, output, apply, prompt=input):
    return run_from_actions(client, ACTIONS["cancelDeleteKMS"], actions_path, output,
                            apply, "eliminazione programmata da deleteKMS", prompt)


def pending_window(value):
    days = int(value)
    if not 7 <= days <= 30:
        raise argparse.ArgumentTypeError("valore ammesso da AWS: 7-30 giorni")
    return days


def positive_timeout(value):
    try:
        timeout = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("Il timeout deve essere un intero positivo") from exc
    if timeout <= 0:
        raise argparse.ArgumentTypeError("Il timeout deve essere un intero positivo")
    return timeout


def non_negative_days(value):
    days = int(value)
    if days < 0:
        raise argparse.ArgumentTypeError("richiesto un valore non negativo")
    return days


def run_report(args, started):
    summary = args.output.with_name(f"{args.output.stem}_summary.csv")
    paths = [args.input.resolve(), args.output.resolve(), summary.resolve()]
    if len(set(paths)) != 3:
        raise ValueError("Input, output e riepilogo devono essere file distinti")
    for path in (args.output, summary):
        if not path.parent.is_dir() or path.is_dir():
            raise ValueError(f"Percorso di output non valido: {path}")
        if path.exists():
            LOGGER.warning("Il file verra' sovrascritto: %s", path)
    microservice = microservice_label(args.microservice) if args.microservice else None
    keys = load_keys(args.input, microservice)
    client = AwsClient(args.profile, REGION, args.timeout)
    account, partition = get_account(client)
    LOGGER.info(
        "Account dal profilo: %s, regione: %s; scansione servizi AWS",
        account, REGION,
    )
    key_arns = {
        key.key_id: f"arn:{partition}:kms:{REGION}:{account}:key/{key.key_id}"
        for key in keys
    }
    result = scan_resources(client, set(key_arns.values()), account, partition)
    write_reports(
        keys, key_arns, result, args.output, summary, account, REGION
    )
    LOGGER.info(
        "Report: %s; riepilogo: %s; %d chiamate AWS, durata %.2fs",
        args.output, summary, client.calls, time.monotonic() - started,
    )
    if result.errors:
        LOGGER.warning("Scansione incompleta: non interpretare l'assenza di match come disuso")
    return 2 if result.errors else 0


def run_key_action(args, started):
    if args.output is None:
        name = args.mode.removesuffix("KMS").lower()
        label = args.microservice or args.input.stem
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        safe = re.sub(r"[^A-Za-z0-9_.-]", "_", label)
        args.output = Path(__file__).parent / f"kms_{name}_{safe}_{stamp}.csv"
    if args.output.resolve() == args.input.resolve():
        raise ValueError("Input e output devono essere file distinti")
    if not args.output.parent.is_dir() or args.output.is_dir():
        raise ValueError(f"Percorso di output non valido: {args.output}")
    if args.output.exists():
        raise ValueError(f"Il file di esiti esiste gia': {args.output}")
    client = AwsClient(args.profile, REGION, args.timeout,
                       extra_operations=ACTIONS[args.mode].operations(args.apply))
    LOGGER.info("Modalita' %s (%s)", args.mode, "APPLY" if args.apply else "dry-run")
    if args.mode == "disableKMS":
        rows = run_disable(
            client, args.input, args.microservice, args.output, args.apply,
            args.min_age_days,
        )
    elif args.mode == "enableKMS":
        rows = run_enable(client, args.input, args.output, args.apply)
    elif args.mode == "deleteKMS":
        rows = run_delete(client, args.input, args.output, args.apply, args.pending_days)
    else:
        rows = run_cancel_delete(client, args.input, args.output, args.apply)
    LOGGER.info("%d chiamate AWS, durata %.2fs", client.calls, time.monotonic() - started)
    return 2 if any(row.get("Outcome") == "ERROR" for row in rows) else 0


def main():
    parser = argparse.ArgumentParser(
        description=(
            "report: verifica associazioni KMS sui servizi AWS (sola lettura); "
            "disableKMS/enableKMS: disabilita/riabilita chiavi inutilizzate; "
            "deleteKMS/cancelDeleteKMS: programma/annulla l'eliminazione delle "
            "chiavi disabilitate"
        )
    )
    parser.add_argument(
        "--mode", choices=("report", *ACTIONS), default="report",
    )
    parser.add_argument(
        "--input", type=Path, required=True,
        help="report: CSV delle chiavi; disableKMS: report completo; "
        "enableKMS/deleteKMS: CSV esiti di disableKMS; "
        "cancelDeleteKMS: CSV esiti di deleteKMS",
    )
    parser.add_argument("--profile", required=True, help="Profilo AWS CLI v2")
    parser.add_argument(
        "--microservice",
        help=f"Valore esatto del tag Microservice ('{NO_TAG}' = chiavi senza tag); "
        "obbligatorio in disableKMS",
    )
    parser.add_argument(
        "--output", type=Path,
        help="report: default kms_associations.csv (+ _summary.csv); "
        "altre modalita': default kms_<azione>_<nome>_<timestamp>.csv",
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="esegue le modifiche (senza: dry-run); non previsto in report",
    )
    parser.add_argument(
        "--min-age-days", type=non_negative_days, default=MIN_KEY_AGE_DAYS,
        help="disableKMS: chiavi create da meno giorni (creation_date del report) "
        "sono da attenzionare (default 30)",
    )
    parser.add_argument(
        "--pending-days", type=pending_window, default=PENDING_WINDOW_DAYS,
        help="deleteKMS: giorni di attesa prima dell'eliminazione definitiva "
        "(7-30, default 30)",
    )
    parser.add_argument("--timeout", type=positive_timeout, default=120)
    parser.add_argument(
        "--log-level", choices=("DEBUG", "INFO", "WARNING", "ERROR"), default="INFO"
    )
    args = parser.parse_args()
    if args.mode == "disableKMS" and not args.microservice:
        parser.error("--microservice obbligatorio in modalita' disableKMS")
    if args.mode in ACTIONS and ACTIONS[args.mode].source and args.microservice:
        parser.error(f"--microservice non previsto in {args.mode}: e' letto dal CSV esiti")
    if args.apply and args.mode == "report":
        parser.error("--apply non previsto in modalita' report")
    logging.basicConfig(
        level=args.log_level, format="%(asctime)s %(levelname)-7s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    started = time.monotonic()
    try:
        if args.mode == "report":
            if args.output is None:
                args.output = Path(__file__).parent / "kms_associations.csv"
            return run_report(args, started)
        return run_key_action(args, started)
    except (OSError, UnicodeError, csv.Error, ValueError, ScanError) as exc:
        LOGGER.error("Operazione non completata: %s", exc)
        return 1
    except KeyboardInterrupt:
        LOGGER.warning("Operazione interrotta dall'utente")
        return 130


if __name__ == "__main__":
    sys.exit(main())
