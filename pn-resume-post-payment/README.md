# pn-resume-post-payment

Node.js utility for loading resume post-payment requests from the CSV associated with one `resumeType`. The current WI-US 3.1 implementation validates invocation, AWS configuration and input-file availability. CSV parsing and SQS publication are implemented by the subsequent work items.

## Prerequisites

- Node.js 20 or later
- npm
- AWS CLI configured for IAM Identity Center/SSO when a profile is used

Install dependencies:

```bash
cd pn-resume-post-payment
npm install
```

## Input files

The script requires one `--resume-type` option:

- `FIRST_ATTEMPT`
- `SECOND_ATTEMPT`
- `SIMPLE_REGISTERED_LETTER`

The corresponding file must exist and be readable under `csv/`:

- `csv/FIRST_ATTEMPT.csv`
- `csv/SECOND_ATTEMPT.csv`
- `csv/SIMPLE_REGISTERED_LETTER.csv`

Operational CSV files are ignored by Git. Only `csv/example.csv`, containing fictitious data, is versioned.

The required header is exactly:

```csv
iun,recIndex
```

The script reads and validates the complete file before preparing any SQS publication. Empty rows are ignored. Invalid rows are reported by line number and error code, while valid records are normalized and published in CSV order, including repeated pairs.

## AWS configuration

AWS configuration is supplied exclusively as command-line options and is validated before the CSV is accessed.

| Option | Required | Purpose |
| --- | --- | --- |
| `--resume-type <type>` | Yes | Resume type: `FIRST_ATTEMPT`, `SECOND_ATTEMPT` or `SIMPLE_REGISTERED_LETTER` |
| `--profile <name>` | Yes | Shared AWS configuration or IAM Identity Center/SSO profile |
| `--region <region>` | Yes | AWS region |
| `--queue-url <url>` | Yes | Destination SQS Queue URL |
| `--endpoint <url>` | No | Alternative SQS endpoint, for example LocalStack |

Authenticate an SSO profile before execution:

```bash
aws sso login --profile sso_pn-core-dev
```

## Execution

From the `pn-troubleshooting` repository root:

```bash
node pn-resume-post-payment/index.js \
	--resume-type FIRST_ATTEMPT \
	--profile sso_pn-core-dev \
	--region eu-south-1 \
	--queue-url https://sqs.eu-south-1.amazonaws.com/000000000000/pn-resume-post-payment-queue
```

LocalStack:

```bash
AWS_ACCESS_KEY_ID=test \
AWS_SECRET_ACCESS_KEY=test \
node pn-resume-post-payment/index.js \
	--resume-type FIRST_ATTEMPT \
	--profile default \
	--region us-east-1 \
	--queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/local-resume-post-payment-queue \
	--endpoint http://localhost:4566
```

Each valid and unique record is published sequentially through `SendMessageCommand`. A publication is successful only when SQS returns a non-empty `MessageId`. A failure is logged and does not prevent subsequent records from being processed.

The final structured summary includes the input counters, successful publications, failed publications and exit code. The command exits with code `0` when every publishable record is confirmed by SQS. Preliminary validation errors or one or more publication failures produce exit code `1`. Malformed rows alone do not produce a non-zero exit code.

## Tests

```bash
cd pn-resume-post-payment
npm test
```

The unit suite uses in-memory mocks and dependency injection for SQS, AWS credentials, commands and filesystem access. It does not require operational CSV files, AWS credentials, an SSO session, LocalStack or application services. The test command enforces minimum coverage thresholds of 95% for lines, statements and functions, and 85% for branches.
