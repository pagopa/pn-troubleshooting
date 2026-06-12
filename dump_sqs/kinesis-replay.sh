#!/bin/bash

set -euo pipefail

if [ "$#" -lt 4 ]; then
  echo "Usage: $0 <stream-name> <region> <aws-profile> <input-file> [dest-stream]"
  exit 1
fi

STREAM_NAME="$1"
REGION="$2"
PROFILE="$3"
INPUT_FILE="$4"
DEST_STREAM="${5:-$STREAM_NAME}"

echo "Source stream : $STREAM_NAME"
echo "Destination   : $DEST_STREAM"
echo "Region        : $REGION"
echo "Profile       : $PROFILE"
echo "Input file    : $INPUT_FILE"
echo "------------------------------------"

while IFS= read -r riga; do

  shardId=$(echo "$riga" | jq -r '.shardId')
  sequenceNumber=$(echo "$riga" | jq -r '.sequenceNumber')

  echo "Replaying shard=$shardId sequence=$sequenceNumber"

  iterator=$(aws kinesis get-shard-iterator \
    --region "$REGION" \
    --profile "$PROFILE" \
    --stream-name "$STREAM_NAME" \
    --shard-id "$shardId" \
    --shard-iterator-type AT_SEQUENCE_NUMBER \
    --starting-sequence-number "$sequenceNumber" \
    --query ShardIterator \
    --output text)

  record=$(aws kinesis get-records \
    --region "$REGION" \
    --profile "$PROFILE" \
    --shard-iterator "$iterator" \
    --limit 1 \
    --output json)

  data=$(echo "$record" | jq -r '.Records[0].Data')
  partitionKey=$(echo "$record" | jq -r '.Records[0].PartitionKey')

  if [ "$data" != "null" ] && [ -n "$data" ]; then

    put_output=$(aws kinesis put-record \
      --region "$REGION" \
      --profile "$PROFILE" \
      --stream-name "$DEST_STREAM" \
      --partition-key "$partitionKey" \
      --data "$data" \
      --output json)

    newSequence=$(echo "$put_output" | jq -r '.SequenceNumber')
    newShard=$(echo "$put_output" | jq -r '.ShardId')

    echo "Reinserted ✔"
    echo "→ New ShardId      : $newShard"
    echo "→ New SequenceNumber: $newSequence"
    echo "→ Full AWS response:"
    echo "$put_output" | jq .

  else
    echo "Record non trovato"
  fi

  echo "------------------------------------"

done < "$INPUT_FILE"

echo "Replay completato."