## Step 1

### Esecuzione
Esecuzione script `dump_sqs`:

`node dump_sqs.js --awsProfile <awsProfile> --queueName pn-delivery_push_actions-DLQ --visibilityTimeout <visibilityTimeout>`

## Step 2

### Input
Output file step 1.

### Esecuzione
Esecuzione comando jq:

`jq -r -c '.[]' <output-step-1> | jq -r -c '{"Body": .Body, "MD5OfBody": .MD5OfBody, "MD5OfMessageAttributes": .MD5OfMessageAttributes}' > <output-step-2>`

## Step 3

### Input
Output file step 2.

### Esecuzione
Esecuzione `PN-11794`:
`node index.js --envName <envName> --fileName <output-step-2>`
