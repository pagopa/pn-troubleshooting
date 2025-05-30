#!/usr/bin/env bash
    
set -Eeuo pipefail
trap cleanup SIGINT SIGTERM ERR EXIT

cleanup() {
  trap - SIGINT SIGTERM ERR EXIT
  # script cleanup here
}

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd -P)


usage() {
      cat <<EOF
    Usage: $(basename "${BASH_SOURCE[0]}") [-h] -e <env-name> -q <queue-name> -w <work-dir>
    [-h]                      : this help message
    -e <env-name>             : env name
    -w <work-dir>             : work directory
    -s <slas>                 : sla name list ("'REFINEMENT' 'VALIDATION'")
    
EOF
  exit 1
}

parse_params() {
  # default values of variables set from params
  work_dir=$HOME
  env_name=""
  slas=""
  unique=false
  
  while :; do
    case "${1-}" in
    -h | --help) usage ;;
    -e | --env-name) 
      env_name="${2-}"
      shift
      ;;
    -w | --work-dir) 
      work_dir="$work_dir${2-}"
      shift
      ;;
    -s | --slas) 
      slas="${2-}"
      shift
      ;;
    -u | --unique) 
      unique=true
      shift
      ;;
    -?*) die "Unknown option: $1" ;;
    *) break ;;
    esac
    shift
  done

  args=("$@")
  return 0
}

dump_params(){
  echo ""
  echo "######      PARAMETERS      ######"
  echo "##################################"
  echo "Env:                ${env_name}"
  echo "Work directory:     ${work_dir}"
  echo "SLAs: (optional)    ${slas}"
  echo "Unique: (optional)  ${unique}"
  echo ""
}

# START SCRIPT

parse_params "$@"
[[ -z "${env_name-}" ]] && usage
[[ -z "${work_dir-}" ]] && usage
dump_params

echo "STARTING SCRIPT EXECUTION"

if [ -z "${slas}" ]; then
  violations=("SEND_PAPER_AR_890 REFINEMENT VALIDATION SEND_PEC SEND_AMR")
else
  violations=($slas)
fi

cd "$work_dir"
echo $slas
# Definizione dell'array di stringhe

current_time=$(date +%Y-%m-%dT%H:%M:%S%z)
# Ciclare sugli elementi dell'array
for violation in "${violations[@]}"
do
  iuns_violation_path="./dump_sla_violation/results/$current_time/"
  echo "DUMPING "$violation" SLA..."
  node ./dump_sla_violation/index.js --awsProfile sso_pn-core-$env_name --slaViolation $violation
  mkdir -p $iuns_violation_path
  dumped_violation=$(find ./dump_sla_violation/results -type f -exec ls -t1 {} + | head -1)
  if ! $unique; then
    echo "GETTING TIMELINE IUNS"
    cat $dumped_violation | jq -r ".[] | .S" > $iuns_violation_path/$violation-iuns.txt
    echo "RETRIEVING TIMELINE IUNS"
    python3 ./timelines_from_iuns/timelines_from_iuns.py $iuns_violation_path/$violation-iuns.txt $iuns_violation_path/$violation-iuns-result.json --profile sso_pn-core-$env_name
    echo "RETRIEVING INFO FROM TIMELINE"
    node ./retrieve_info_from_timelines/index.js --envName $env_name --fileName $iuns_violation_path/$violation-iuns-result.json --outputFolder automation-script
  else
    echo "GETTING TIMELINE IUNS"
    cat $dumped_violation | jq -r ".[] | .S" >> $iuns_violation_path/total-iuns.txt
    sort $iuns_violation_path/total-iuns.txt | uniq > $iuns_violation_path/total-iuns-unique.txt
  fi
done
if $unique; then
  echo "RETRIEVING TIMELINE IUNS"
  python3 ./timelines_from_iuns/timelines_from_iuns.py $iuns_violation_path/total-iuns-unique.txt ${iuns_violation_path}total-iuns-result.json --profile sso_pn-core-$env_name
  echo "RETRIEVING INFO FROM TIMELINE"
  node ./retrieve_info_from_timelines/index.js --envName $env_name --fileName ${iuns_violation_path}total-iuns-result.json --outputFolder automation-script
fi

echo "EXECUTION COMPLETE"