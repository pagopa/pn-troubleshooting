#!/bin/bash

# --- CONFIGURAZIONE ---
# Inserisci qui i nomi delle tue code DLQ (separati da spazio)
QUEUES=(
  "pn-ss-transformation-sign-and-timemark-queue-DLQ"
  "pn-ss-transformation-sign-queue-DLQ"
  "pn-ss-main-bucket-events-queue-DLQ"
  "pn-ss-transformation-raster-queue-DLQ"
  "pn-ec-tracker-sms-errori-queue-DLQ.fifo"
  "pn-ec-tracker-pec-errori-queue-DLQ.fifo"
  "pn-ec-tracker-email-errori-queue-DLQ.fifo"
  "pn-ec-tracker-cartaceo-errori-queue-DLQ.fifo"
  "pn-ec-tracker-sercq-send-errori-queue-DLQ.fifo"
)

START_TIME=$(date -u -d '60 days ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-60d +%Y-%m-%dT%H:%M:%SZ)
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PERIOD=86400
PROFILE=$1

echo "======================================================================"
echo " Analisi Metriche DLQ (Ultimi 60 Giorni)"
echo "======================================================================"
printf "%-60s | %-12s | %-12s\n" "Nome Coda DLQ" "Max Messaggi" "Media Messaggi"
echo "----------------------------------------------------------------------"

START_TIME=$(date -u -d '60 days ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-60d +%Y-%m-%dT%H:%M:%SZ)
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PERIOD=86400

for QUEUE in "${QUEUES[@]}"; do
  echo "=================================================="
  echo " ANALISI CODA: $QUEUE"
  echo "=================================================="
  printf "%-12s | %-15s\n" "Data" "Max del Giorno"
  echo "--------------------------------------------------"

  # Chiamata AWS CLI
  RESPONSE=$(aws cloudwatch --profile $PROFILE  get-metric-statistics \
    --namespace AWS/SQS \
    --metric-name ApproximateNumberOfMessagesVisible \
    --dimensions Name=QueueName,Value="$QUEUE" \
    --start-time "$START_TIME" \
    --end-time "$END_TIME" \
    --period "$PERIOD" \
    --statistics Maximum \
    --output json)

  # 1. Elenco dettagliato giorno per giorno
  echo "$RESPONSE" | jq -r '
    .Datapoints 
    | sort_by(.Timestamp)[] 
    | [ (.Timestamp[0:10]), (.Maximum | tostring) ] 
    | @tsv
  ' | while IFS=$'\t' read -r date max; do
    printf "%-12s | %-15s\n" "$date" "$max"
  done

  # 2. Calcolo dei valori finali aggregati sui 60 giorni
  MAX_ABS=$(echo "$RESPONSE" | jq '[.Datapoints[].Maximum] | max // 0')
  AVG_MAX=$(echo "$RESPONSE" | jq 'if (.Datapoints | length) > 0 then ([.Datapoints[].Maximum] | add / length) else 0 end' | xargs printf "%.2f")

  echo "--------------------------------------------------"
  echo " SUMMARY FINALE (Ultimi 60 giorni):"
  echo "  • MAX ASSOLUTO:         $MAX_ABS messaggi"
  echo "  • MEDIA MAX GIORNALIERI: $AVG_MAX messaggi"
  echo "=================================================="
  echo ""
done