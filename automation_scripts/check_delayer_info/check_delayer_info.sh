#!/usr/bin/env bash
set -euo pipefail

# =====================
# Disabilita pager AWS
# =====================
export AWS_PAGER=""

# =====================
# INPUT
# =====================
AWS_PROFILE="${1:-}"
REGION="${2:-eu-south-1}"

if [[ -z "$AWS_PROFILE" ]]; then
  echo "Uso: $0 <aws-profile> [region]"
  exit 1
fi

# =====================
# Funzione: converte ISO-8601 in epoch (Linux + macOS)
# =====================
to_epoch() {
  local iso="$1"
  local clean

  # Rimuove caratteri di controllo invisibili
  clean=$(echo "$iso" | tr -d '\000-\037')

  # Rimuove microsecondi
  clean=$(echo "$clean" | sed -E 's/\.[0-9]+//')

  # Converte +01:00 -> +0100 per BSD date
  clean=$(echo "$clean" | sed -E 's/([+-][0-9]{2}):([0-9]{2})/\1\2/')

  if date --version >/dev/null 2>&1; then
    # GNU date (Linux)
    date -d "$clean" +%s
  else
    # BSD date (macOS)
    date -j -f "%Y-%m-%dT%H:%M:%S%z" "$clean" "+%s"
  fi
}

# Funzione: estrae ora da timestamp ISO-8601
get_hour() {
  local iso="$1"
  local clean

  clean=$(echo "$iso" | sed -E 's/\.[0-9]+//')
  clean=$(echo "$clean" | sed -E 's/([+-][0-9]{2}):([0-9]{2})/\1\2/')

  if date --version >/dev/null 2>&1; then
    date -d "$clean" +%H
  else
    date -j -f "%Y-%m-%dT%H:%M:%S%z" "$clean" "+%H"
  fi
}

# =====================
# CONFIG
# =====================
STATE_MACHINE_NAME="RetryAlgorithmStateMachine"
SCHEDULER_GROUP="default"
SCHEDULER_1="pn-delayerToPaperChannelDailyFirstScheduler"
SCHEDULER_2="pn-delayerToPaperChannelDailySecondScheduler"

# =====================
# AWS ACCOUNT ID
# =====================
echo "Recupero AWS Account ID..."
ACCOUNT_ID=$(aws sts get-caller-identity \
  --profile "$AWS_PROFILE" \
  --region "$REGION" \
  --query Account \
  --output text)
echo "Account ID: $ACCOUNT_ID"
echo

STATE_MACHINE_ARN="arn:aws:states:${REGION}:${ACCOUNT_ID}:stateMachine:${STATE_MACHINE_NAME}"

# =====================
# 1. Stato ultima esecuzione Step Function
# =====================
echo "Ultima esecuzione Step Function..."
LAST_EXECUTION=$(aws stepfunctions list-executions \
  --state-machine-arn "$STATE_MACHINE_ARN" \
  --max-items 1 \
  --profile "$AWS_PROFILE" \
  --region "$REGION" \
  --output json)

LAST_EXECUTION_CLEAN=$(echo "$LAST_EXECUTION" | tr -d '\000-\037')
EXEC_STATUS=$(echo "$LAST_EXECUTION_CLEAN" | jq -r '.executions[0].status')
EXEC_START=$(echo "$LAST_EXECUTION_CLEAN" | jq -r '.executions[0].startDate')
EXEC_STOP=$(echo "$LAST_EXECUTION_CLEAN" | jq -r '.executions[0].stopDate')

echo "Status: $EXEC_STATUS"
echo "Start : $EXEC_START"
echo "Stop  : $EXEC_STOP"
echo

# =====================
# 2. Verifica scheduler ENABLED e attivo
# =====================
echo "Verifica scheduler..."
NOW_EPOCH=$(date -u +%s)

ACTIVE_CRON=""
ACTIVE_START=""
ACTIVE_SCHEDULER=""

check_scheduler() {
  local NAME=$1

  INFO=$(aws scheduler get-schedule \
    --name "$NAME" \
    --group-name "$SCHEDULER_GROUP" \
    --profile "$AWS_PROFILE" \
    --region "$REGION" \
    --output json)

  INFO_CLEAN=$(echo "$INFO" | tr -d '\000-\037')
  STATUS=$(echo "$INFO_CLEAN" | jq -r '.State')
  START_DATE=$(echo "$INFO_CLEAN" | jq -r '.StartDate')
  END_DATE=$(echo "$INFO_CLEAN" | jq -r '.EndDate')
  CRON=$(echo "$INFO_CLEAN" | jq -r '.ScheduleExpression')

  START_EPOCH=$(to_epoch "$START_DATE")
  END_EPOCH=$(to_epoch "$END_DATE")

  echo "   Scheduler: $NAME"
  echo "   Status: $STATUS"
  echo "   Start : $START_DATE"
  echo "   End   : $END_DATE"

  if [[ "$STATUS" != "ENABLED" ]]; then
    echo "   DISABILITATO"
    echo
    return
  fi

  # Controlla se lo scheduler è attivo ora
  if (( NOW_EPOCH >= START_EPOCH && NOW_EPOCH <= END_EPOCH )); then
    echo "   ATTIVO ORA"
    ACTIVE_CRON="$CRON"
    ACTIVE_START="$START_DATE"
    ACTIVE_SCHEDULER="$NAME"
  else
    echo "   NON ATTIVO ORA"
  fi
  echo
}

check_scheduler "$SCHEDULER_1"
check_scheduler "$SCHEDULER_2"

if [[ -z "$ACTIVE_CRON" ]]; then
  echo "Nessuno scheduler attivo al momento"
  exit 1
fi

echo "Scheduler attivo corrente: $ACTIVE_SCHEDULER"

# =====================
# 3. Calcolo esecuzioni perse
# =====================
echo "Calcolo esecuzioni perse..."

# Estrae ora dal cron (primo valore se range tipo 5-21)
CRON_HOUR=$(echo "$ACTIVE_CRON" | sed -E 's/cron\([0-9]+ ([0-9]+)(-[0-9]+)?.*/\1/')

# Estrarre ora da StartDate
START_HOUR=$(get_hour "$ACTIVE_START")

# Calcola esecuzioni perse come differenza tra cron hour e start hour
MISSED=$(( START_HOUR - CRON_HOUR + 1 ))
if (( MISSED < 0 )); then
  MISSED=0
fi

echo "Ora di avvio schedulatore : $ACTIVE_START"
echo "Ora di inizio cron        : $ACTIVE_CRON"
echo "Esecuzioni perse          : $MISSED"
