#!/bin/bash

set -e

# Load .env if present
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -o allexport
  source "$SCRIPT_DIR/.env"
  set +o allexport
fi

OUTPUTDIR="$SCRIPT_DIR"
mkdir -p "$OUTPUTDIR"

CONFINFO_ALB_ENDPOINT="${CONFINFO_ALB_ENDPOINT:-alb.confidential.pn.internal}"
SSM_FORWARD_PORT="${SSM_FORWARD_PORT:-8080}"
SSM_LOCAL_PORT="${SSM_LOCAL_PORT:-8888}"
ENV_NAME="${envName:-${ENV_NAME:-}}"
PROFILE_PREFIX="sso_pn-core-"
PID_FILE="$OUTPUTDIR/.ssm_bastion_to_confinfo.pid"


usage() {
  echo "Usage: $0 --start|--stop --env <environment>"
  echo "  --start         Start SSM port forwarding session"
  echo "  --stop          Stop SSM port forwarding session"
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

get_bastion_instance_id() {
  aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=*bastion*" "Name=instance-state-name,Values=running" \
    --profile "$PROFILE" \
    --query "Reservations[0].Instances[0].InstanceId" \
    --output text
}

start_port_forwarding() {
  INSTANCE_ID=$(get_bastion_instance_id)
  if [[ "$INSTANCE_ID" == "None" || -z "$INSTANCE_ID" ]]; then
    echo "No running bastion instance found"
    exit 1
  fi
  echo "Using bastion instance: $INSTANCE_ID"
  echo "Starting port forwarding: local $SSM_LOCAL_PORT -> $CONFINFO_ALB_ENDPOINT:$SSM_FORWARD_PORT"
  aws ssm start-session \
    --target "$INSTANCE_ID" \
    --document-name "AWS-StartPortForwardingSessionToRemoteHost" \
    --parameters "portNumber=$SSM_FORWARD_PORT,localPortNumber=$SSM_LOCAL_PORT,host=$CONFINFO_ALB_ENDPOINT" \
    --profile "$PROFILE" > "$OUTPUTDIR/.ssm_bastion_to_confinfo.log" 2>&1 &
  SSM_PID=$!
  echo $SSM_PID > "$PID_FILE"
  echo "SSM port forwarding started with PID $SSM_PID"
}

stop_port_forwarding() {
  if [[ -f "$PID_FILE" ]]; then
    SSM_PID=$(cat "$PID_FILE")
    if kill -0 "$SSM_PID" 2>/dev/null; then
      kill "$SSM_PID"
      echo "Stopped SSM port forwarding (PID $SSM_PID)"
    else
      echo "No running SSM port forwarding process found"
    fi
    rm -f "$PID_FILE"
  else
    echo "No PID file found. Is port forwarding running?"
  fi

  if command -v lsof >/dev/null 2>&1; then
    PIDS_ON_PORT=$(lsof -ti tcp:"$SSM_LOCAL_PORT")
    if [[ -n "$PIDS_ON_PORT" ]]; then
      echo "Killing processes listening on port $SSM_LOCAL_PORT: $PIDS_ON_PORT"
      kill $PIDS_ON_PORT || true
    fi
  fi
}

case "$COMMAND" in
  start) start_port_forwarding ;;
  stop) stop_port_forwarding ;;
  *) usage ;;
esac
