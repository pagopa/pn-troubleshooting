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

The script accepts exactly one positional argument:

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

The script reads and validates the complete file before preparing any SQS publication. Empty rows are ignored. Invalid rows are reported by line number and error code, while valid records are normalized and deduplicated by `iun + recIndex`.

## AWS configuration

AWS configuration is read exclusively from environment variables. AWS configuration options are not accepted on the command line.

| Variable | Required | Purpose |
| --- | --- | --- |
| `AWS_PROFILE` | No | Shared AWS configuration or IAM Identity Center/SSO profile |
| `AWS_REGION` | Yes, unless fallback is set | AWS region; takes precedence over `AWS_DEFAULT_REGION` |
| `AWS_DEFAULT_REGION` | No | Region fallback |
| `PN_RESUME_POST_PAYMENT_QUEUE_URL` | Yes | Destination SQS Queue URL |
| `SQS_ENDPOINT_URL` | No | Alternative SQS endpoint, for example LocalStack |

When `AWS_PROFILE` is absent, the AWS SDK default credential provider chain is used.

Authenticate an SSO profile before execution:

```bash
aws sso login --profile sso_pn-core-dev
```

## Execution

From the `pn-troubleshooting` repository root, AWS environment:

```bash
AWS_PROFILE=sso_pn-core-dev \
AWS_REGION=eu-south-1 \
PN_RESUME_POST_PAYMENT_QUEUE_URL=https://sqs.eu-south-1.amazonaws.com/000000000000/pn-resume-post-payment-queue \
node pn-resume-post-payment/index.js FIRST_ATTEMPT
```

LocalStack:

```bash
AWS_ACCESS_KEY_ID=test \
AWS_SECRET_ACCESS_KEY=test \
AWS_REGION=us-east-1 \
PN_RESUME_POST_PAYMENT_QUEUE_URL=http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/local-resume-post-payment-queue \
SQS_ENDPOINT_URL=http://localhost:4566 \
node pn-resume-post-payment/index.js FIRST_ATTEMPT
```

Each valid and unique record is published sequentially through `SendMessageCommand`. A publication is successful only when SQS returns a non-empty `MessageId`. A failure is logged and does not prevent subsequent records from being processed.

The final structured summary includes the input counters, successful publications, failed publications and exit code. The command exits with code `0` when every publishable record is confirmed by SQS. Preliminary validation errors or one or more publication failures produce exit code `1`. Malformed or duplicate rows alone do not produce a non-zero exit code.

## Tests

```bash
cd pn-resume-post-payment
npm test
```
