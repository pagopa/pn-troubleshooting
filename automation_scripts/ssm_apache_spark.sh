#!/bin/bash

set -e

# Load .env if present
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -o allexport
  source "$SCRIPT_DIR/.env"
  set +o allexport
fi

OUTPUTDIR="$SCRIPT_DIR/output/ssm_apache_spark"
mkdir -p "$OUTPUTDIR"

SSM_PORT1="${SSM_PORT1:-4040}"
SSM_PORT2="${SSM_PORT2:-10100}"
SSM_LOCAL_PORT1="${SSM_LOCAL_PORT1:-4040}"
SSM_LOCAL_PORT2="${SSM_LOCAL_PORT2:-10100}"
ENV_NAME="${envName:-${ENV_NAME:-}}"
PROFILE_PREFIX="sso_pn-core-"
PID_FILE1="$OUTPUTDIR/.ssm_apache_spark_1.pid"
PID_FILE2="$OUTPUTDIR/.ssm_apache_spark_2.pid"

usage() {
  echo "Usage: $0 --start|--stop --env <environment>"
  echo "  --start         Start SSM port forwarding sessions"
  echo "  --stop          Stop SSM port forwarding sessions"
  echo "  --env <env>     Environment (prod|uat|hotfix|test)"
  exit 1
}

if [[ $# -lt 2 ]]; then
  usage
fi

COMMAND=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --start) COMMAND="start"; shift ;;
    --stop) COMMAND="stop"; shift ;;
    --env) ENV_NAME="$2"; shift 2 ;;
    *) usage ;;
  esac
done

if [[ -z "$ENV_NAME" ]]; then
  echo "Missing --env argument"
  usage
fi

PROFILE="${PROFILE_PREFIX}${ENV_NAME}"

get_spark_instance_id() {
  aws ec2 describe-instances \
    --filters "Name=tag:usage,Values=spark" "Name=instance-state-name,Values=running" \
    --profile "$PROFILE" \
    --query "Reservations[0].Instances[0].InstanceId" \
    --output text
}

start_port_forwarding() {
  INSTANCE_ID=$(get_spark_instance_id)
  if [[ "$INSTANCE_ID" == "None" || -z "$INSTANCE_ID" ]]; then
    echo "No EC2 Spark instance found"
    exit 1
  fi

  INSTANCE_STATE=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" --profile "$PROFILE" --query "Reservations[0].Instances[0].State.Name" --output text)
  if [[ "$INSTANCE_STATE" != "running" ]]; then
    echo "Starting Spark instance: $INSTANCE_ID"
    aws ec2 start-instances --instance-ids "$INSTANCE_ID" --profile "$PROFILE" >/dev/null
    echo "Waiting for Spark instance to be running..."
    aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --profile "$PROFILE"
  fi

  echo "Using Spark instance: $INSTANCE_ID"
  echo "Starting port forwarding: local $SSM_LOCAL_PORT1 -> $INSTANCE_ID:$SSM_PORT1"
  aws ssm start-session \
    --target "$INSTANCE_ID" \
    --document-name "AWS-StartPortForwardingSession" \
    --parameters "portNumber=$SSM_PORT1,localPortNumber=$SSM_LOCAL_PORT1" \
    --profile "$PROFILE" > "$OUTPUTDIR/.ssm_apache_spark_1.log" 2>&1 &
  SSM_PID1=$!
  echo $SSM_PID1 > "$PID_FILE1"

  echo "Starting port forwarding: local $SSM_LOCAL_PORT2 -> $INSTANCE_ID:$SSM_PORT2"
  aws ssm start-session \
    --target "$INSTANCE_ID" \
    --document-name "AWS-StartPortForwardingSession" \
    --parameters "portNumber=$SSM_PORT2,localPortNumber=$SSM_LOCAL_PORT2" \
    --profile "$PROFILE" > "$OUTPUTDIR/.ssm_apache_spark_2.log" 2>&1 &
  SSM_PID2=$!
  echo $SSM_PID2 > "$PID_FILE2"

  echo "SSM port forwarding started with PIDs $SSM_PID1 (port $SSM_PORT1) and $SSM_PID2 (port $SSM_PORT2)"
}

stop_port_forwarding() {
  for i in 1 2; do
    PID_FILE="$OUTPUTDIR/.ssm_apache_spark_${i}.pid"
    if [[ -f "$PID_FILE" ]]; then
      SSM_PID=$(cat "$PID_FILE")
      if kill -0 "$SSM_PID" 2>/dev/null; then
        kill "$SSM_PID"
        echo "Stopped SSM port forwarding (PID $SSM_PID)"
      else
        echo "No running SSM port forwarding process found for PID file $PID_FILE"
      fi
      rm -f "$PID_FILE"
    else
      echo "No PID file found for session $i. Is port forwarding running?"
    fi
  done

  if command -v lsof >/dev/null 2>&1; then
    for PORT in "$SSM_LOCAL_PORT1" "$SSM_LOCAL_PORT2"; do
      PIDS_ON_PORT=$(lsof -ti tcp:"$PORT")
      if [[ -n "$PIDS_ON_PORT" ]]; then
        echo "Killing processes listening on port $PORT: $PIDS_ON_PORT"
        kill $PIDS_ON_PORT || true
      fi
    done
  fi

  INSTANCE_STATE=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" --profile "$PROFILE" --query "Reservations[0].Instances[0].State.Name" --output text)
  if [[ "$INSTANCE_STATE" == "running" ]]; then
    echo "Stopping Spark instance: $INSTANCE_ID"
    aws ec2 stop-instances --instance-ids "$INSTANCE_ID" --profile "$PROFILE" >/dev/null
    echo "Waiting for Spark instance to stop..."
    aws ec2 wait instance-stopped --instance-ids "$INSTANCE_ID" --profile "$PROFILE"
  fi
}

case "$COMMAND" in
  start) start_port_forwarding ;;
  stop) stop_port_forwarding ;;
  *) usage ;;
esac
