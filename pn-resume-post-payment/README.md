# pn-resume-post-payment

Node.js utility for validating and publishing resume post-payment requests from the CSV associated with one `resumeType`.

## Prerequisites

- Node.js 20 or later
- npm
- AWS CLI configured for IAM Identity Center/SSO

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

Operational CSV files are ignored by Git.

The required header is exactly:

```csv
iun,recIndex
```

The script parses and validates the complete file before preparing any SQS publication. Rows with invalid `iun` or `recIndex` values are reported by line number and error code, while valid records are normalized and published in CSV order, including repeated pairs.

CSV parsing is delegated to `_parseCSV` from `pn-common`. The file must contain at least one data row and must not contain rows with a different number of columns. Structural CSV errors stop execution before the SQS client is initialized.

## AWS configuration

AWS access is managed by `AwsClientsWrapper` from `pn-common`. The script uses the `core` account, derives the profile as `sso_pn-core-<envName>` and uses the `eu-south-1` region.

| Option | Required | Purpose |
| --- | --- | --- |
| `--resume-type <type>` | Yes | Resume type: `FIRST_ATTEMPT`, `SECOND_ATTEMPT` or `SIMPLE_REGISTERED_LETTER` |
| `--envName <environment>` | Yes | PN environment used to derive the `sso_pn-core-<environment>` profile |
| `--queue-url <url>` | Yes | Destination SQS Queue URL |

`AwsClientsWrapper` checks the SSO session and may start `aws sso login` automatically. The profile can also be authenticated before execution:

```bash
aws sso login --profile sso_pn-core-dev
```

## Execution

From the `pn-troubleshooting` repository root:

```bash
node pn-resume-post-payment/index.js \
	--resume-type FIRST_ATTEMPT \
	--envName dev \
	--queue-url https://sqs.eu-south-1.amazonaws.com/000000000000/pn-resume-post-payment-queue
```

Custom AWS profiles, regions and SQS endpoints are not supported because the shared wrapper owns that configuration. Consequently, this script cannot target LocalStack through a CLI endpoint option.

Each valid record is published sequentially through `_sendSQSMessage`, including repeated records. A publication is successful only when SQS returns a non-empty `MessageId`. A failure is logged and does not prevent subsequent records from being processed.

The final structured summary includes the input counters, successful publications, failed publications and exit code. The command exits with code `0` when every publishable record is confirmed by SQS. Preliminary validation errors or one or more publication failures produce exit code `1`. Malformed rows alone do not produce a non-zero exit code.

## Tests

```bash
cd pn-resume-post-payment
npm test
```

The unit suite uses in-memory mocks and dependency injection for the shared AWS wrapper and CSV parser. It does not require operational CSV files, AWS credentials, an SSO session or application services. The test command enforces minimum coverage thresholds of 95% for lines, statements and functions, and 85% for branches.
