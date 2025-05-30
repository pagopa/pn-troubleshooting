#!/usr/bin/env bash

set -Eeuo pipefail
#trap cleanup SIGINT SIGTERM ERR EXIT

cleanup() {
  echo "Cleanup in esecuzione..."
  trap - SIGINT SIGTERM ERR EXIT
}

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd -P)

usage() {
  cat <<EOF
Usage: $(basename "${BASH_SOURCE[0]}") [-h] -p <aws-profile> -d <start-datelog> -e <end-datelog>
  [-h]                      : this help message
  -p <aws-profile>          : aws-profile
  -d <start-datelog>        : start date and hour (format: YYYY-MM-DD-HH)
  -e <end-datelog>          : end date and hour (format: YYYY-MM-DD-HH)
EOF
  exit 1
}

validate_date_format() {
  local date="$1"
  if ! [[ "$date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "Errore: La data '$date' non è nel formato corretto (YYYY-MM-DD-HH)."
    exit 1
  fi
}

parse_params() {
  aws_profile=""
  start_datelog=""
  end_datelog=""

  while :; do
    case "${1-}" in
    -h | --help) usage ;;
    -p | --profile) 
      aws_profile="${2-}"
      shift
      ;;
    -d | --start-datelog) 
      start_datelog="${2-}"
      shift
      ;;
    -e | --end-datelog) 
      end_datelog="${2-}"
      shift
      ;;
    -?*) usage "Unknown option: $1" ;;
    *) break ;;
    esac
    shift
  done

  # Check required parameters and arguments
  if [[ -z "${aws_profile-}" ]]; then
    echo "Errore: aws_profile non fornito."
    usage 
  fi 
  if [[ -z "${start_datelog-}" ]]; then
    echo "Errore: start_datelog non fornito."
    usage 
  fi 
  if [[ -z "${end_datelog-}" ]]; then
    echo "Errore: end_datelog non fornito."
    usage 
  fi 

  # Validate the date formats
  validate_date_format "$start_datelog"
  validate_date_format "$end_datelog"
}

dump_params() {
  echo ""
  echo "######      PARAMETERS      ######"
  echo "##################################"
  echo "AWS Profile:        ${aws_profile}"
  echo "Start Date:         ${start_datelog}"
  echo "End Date:           ${end_datelog}"
}

# START SCRIPT

echo "Parsing parameters..."
parse_params "$@"

dump_params

echo "=== Base AWS command parameters ==="
aws_command_base_args=""
if [[ ! -z "${aws_profile}" ]]; then
  aws_command_base_args="${aws_command_base_args} --profile $aws_profile"
fi
echo "${aws_command_base_args}"

echo "STARTING EXECUTION"

# Ottieni il nome del bucket S3
S3_BUCKET="$(aws ${aws_command_base_args} s3api list-buckets --query 'Buckets[].Name' --output text | tr '\t' '\n' | grep "^pn-logs-bucket-eu-south-1" | head -n 1)"

if [[ -z "$S3_BUCKET" ]]; then
  echo "Errore: Nessun bucket trovato con il prefisso 'pn-logs-bucket-eu-south-1'"
  exit 1
fi

S3_PATH_PREFIX="logsTos3"

# Imposta la directory di output
output_dir="./output/logs-${start_datelog}-${end_datelog}-${aws_profile}"
mkdir -p "$output_dir"
cd "$output_dir"

# Estrai anno, mese, giorno e ora dai parametri
start_year=$(echo "$start_datelog" | cut -d'-' -f1)
start_month=$(echo "$start_datelog" | cut -d'-' -f2)
start_day=$(echo "$start_datelog" | cut -d'-' -f3)
start_hour=$(echo "$start_datelog" | cut -d'-' -f4)

end_hour=$(echo "$end_datelog" | cut -d'-' -f4)

# Assicurati che lo script gestisca solo un singolo giorno
if [[ "$start_year-$start_month-$start_day" != "$(echo "$end_datelog" | cut -d'-' -f1-3)" ]]; then
  echo "Errore: Lo script gestisce solo intervalli orari all'interno dello stesso giorno."
  exit 1
fi

# Itera sulle ore tra start_hour e end_hour
current_hour=$start_hour
while [[ "$current_hour" -le "$end_hour" ]]; do
  # Percorso completo S3 per l'ora specifica
  S3_PATH="s3://${S3_BUCKET}/${S3_PATH_PREFIX}/${start_year}/${start_month}/${start_day}/$(printf '%02d' $current_hour)/"

  echo "Scaricamento dei file dal percorso: ${S3_PATH}"
  aws ${aws_command_base_args} s3 cp --recursive "${S3_PATH}" .   
  
  # Verifica l'esito del download
  if [[ $? -eq 0 ]]; then
    echo "Download completato con successo per l'ora $current_hour."
  else
    echo "Errore durante il download dei file per l'ora $current_hour. Verifica i dettagli e riprova."
  fi

  # Incrementa l'ora corrente
  current_hour=$(printf '%02d' $((10#$current_hour + 1)))
done

# Estrazione dei file
for hour_dir in */; do
  echo "Estrazione dei file nella cartella: $hour_dir"
  cd "$hour_dir" || { echo "Errore nel passaggio alla cartella $hour_dir"; exit 1; }

  # Estrai i file usando 7z e rimuovi l'originale
  for file in *; do
    if [[ -f "$file" ]]; then
      echo "Estrazione di: $file"
      # Estrai il file
      7z e "$file" -o. > /dev/null
      
      # Rimuovi il file originale
      rm "$file"
      echo "Rimosso il file originale: $file"
    fi
  done

  cd ..
done

echo "Estrazione completata con successo."
