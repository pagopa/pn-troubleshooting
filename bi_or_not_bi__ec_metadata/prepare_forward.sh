#! /bin/bash

# TODO pass profile and region from outside
AWS_PROFILE=sso_pn-core-prod
AWS_REGION=eu-south-1

#######################################
# Start tunnel to EC2 instance using SSM
# Globals:
#   AWS_PROFILE
#   AWS_REGION
# Arguments:
#   ec2_instance_id
#######################################
function start_port_forwarding() {
  ec2_instance_id=$1

  aws --profile ${AWS_PROFILE} --region ${AWS_REGION} \
        ssm start-session \
          --target "${ec2_instance_id}" \
          --document-name AWS-StartPortForwardingSession \
          --parameters '{"portNumber":["4040"],"localPortNumber":["4040"]}' &

  aws --profile ${AWS_PROFILE} --region ${AWS_REGION} \
        ssm start-session \
          --target "${ec2_instance_id}" \
          --document-name AWS-StartPortForwardingSession \
          --parameters '{"portNumber":["10100"],"localPortNumber":["10100"]}' &
}

#######################################
# Start EC2 instance
# Globals:
#   AWS_PROFILE
#   AWS_REGION
# Arguments:
#   ec2_instance_id
#######################################
function start_ec2_instance() {
    ec2_instance_id=$1

    aws --profile ${AWS_PROFILE} --region ${AWS_REGION} ec2 start-instances --instance-ids "${ec2_instance_id}" --no-cli-pager
}

#######################################
# Retrieve EC2 instance starting from tags
# Globals:
#   AWS_PROFILE
#   AWS_REGION
# Arguments:
#   None
# Outputs:
#   EC2 instance identifier
#######################################
function get_ec2_instance_id() {

  local ec2_instance_id=$( aws --profile ${AWS_PROFILE} --region ${AWS_REGION} \
        ec2 describe-instances \
        --filters 'Name=tag:Name,Values=vm-bionbi'  \
        --output text --query 'Reservations[*].Instances[*].InstanceId' )

  echo "$ec2_instance_id"
}

#######################################
# Retrieve EC2 instance state
# Globals:
#   AWS_PROFILE
#   AWS_REGION
# Arguments:
#   ec2_instance_id
# Outputs:
#   EC2 instance state
#######################################
function get_ec2_instance_state() {
  ec2_instance_id=$1

  local ec2_instance_state=$( aws --profile ${AWS_PROFILE} --region ${AWS_REGION} \
        ec2 describe-instances \
        --filters 'Name=tag:Name,Values=vm-bionbi'  \
        --output text --query 'Reservations[*].Instances[*].State.Name' )

  echo "$ec2_instance_state"
}

#######################################
# Main entrypoint
# Globals:
#   AWS_PROFILE
#   AWS_REGION
# Arguments:
#   None
#######################################
function run() {

  ec2_instance_id=$(get_ec2_instance_id)
  ec2_instance_state=$(get_ec2_instance_state)

  # EC2 is already running, connect via ssm
  if [[ $ec2_instance_state == "running" ]]; then
    echo "Starting port forwarding"
    start_port_forwarding ${ec2_instance_id}

  # EC2 is in stopped state, starting EC2 and poll status until is running to connect via ssm
  elif [[ $ec2_instance_state == "stopped" ]]; then
    echo "Starting EC2"
    start_ec2_instance ${ec2_instance_id}

    while [[ $ec2_instance_state != "running" ]]; do
      echo "Waiting for instance state change to running"
      sleep 15
      ec2_instance_state=$(get_ec2_instance_state)
    done

    start_port_forwarding ${ec2_instance_id}

  # EC2 is in another state like stopping, pending or shutting-down (we don't want interfere with these states)
  else
    echo "EC2 cannot be connected or started because ${ec2_instance_id} is in state: '${ec2_instance_state}'"
  fi
}

# Start entrypoint
run