#!/bin/bash

# --- Parameters ----

# AWS profiles = ["core","confinfo"];
# actions = ["start","stop"];
# envs = ["dev","test","hotfix","uat"];

AWS_PROFILE="core"
REGION="eu-south-1"
ENV="hotfix"
ACTION="stop"

# --- Exec Node.js script ----
echo -e " -> Executing command:

node lambda_start_stop_env.js \ \n
\t--awsProfile=${AWS_PROFILE} \ \n
\t--region ${REGION} \ \n
\t--env ${ENV} \ \n
\t--action ${ACTION}
"

node lambda_start_stop_env.js \
        --awsProfile=${AWS_PROFILE} \
        --region ${REGION} \
        --env ${ENV} \
        --action ${ACTION}
