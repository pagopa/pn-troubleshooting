#!/bin/bash

set -e


# Script Usage
usage() {
    echo "Usage: $0 -p <AWS_PROFILE>  -o <OUTPUT_DIR>"
    exit 1
}

# Parsing 
while getopts ":p:o:" opt; do
  case ${opt} in
    p )
      AWS_PROFILE=$OPTARG
      ;;
    o )
      OUTPUT_DIR=$OPTARG
      ;;
    \? )
      usage
      ;;
  esac
done

# Verify Variable
if [ -z "$AWS_PROFILE" ] || [ -z "$OUTPUT_DIR" ]; then
    echo "Error: AWS profile and output directory not provided."
    usage
fi

# Rest of your script...
echo "Using AWS_PROFILE: $AWS_PROFILE"

# Variables for SSM Tunnel
AWS_REGION="eu-south-1"
INSTANCE_TAG="spark"
LOCAL_PORTS=("4040" "10100")


# Variables for configuration
IMAGE_NAME="hive-client-image"
CONTAINER_NAME="hive-container"
HIVE_URL="jdbc:hive2://host.docker.internal:10100"
OUTPUT_FILE="PnData.csv"
TEMP_OUTPUT_FILE="spark_temp.csv"
QUERY_FILE="$PWD/queries.sql"

# Cleaning Fuction
cleanup() {
    echo "Cleaning up..."
    pkill session-manager-plugin || true
    docker stop $CONTAINER_NAME || true
    docker rm $CONTAINER_NAME || true
}

# Inzialize Trap in case of an arror
trap cleanup EXIT

# Fuction SSM tunnel
start_ssm_tunnel() {
    echo "Starting SSM tunnel..."
    spark_ec2_instance_id=$(aws --profile ${AWS_PROFILE} --region ${AWS_REGION} \
        ec2 describe-instances \
        --filters "Name=tag:usage,Values=${INSTANCE_TAG}" \
        --output text --query 'Reservations[*].Instances[*].InstanceId')

    aws --profile ${AWS_PROFILE} --region ${AWS_REGION} \
        ec2 start-instances \
        --instance-ids "${spark_ec2_instance_id}"

    for PORT in "${LOCAL_PORTS[@]}"; do
        aws --profile ${AWS_PROFILE} --region ${AWS_REGION} \
            ssm start-session \
            --target "${spark_ec2_instance_id}" \
            --document-name AWS-StartPortForwardingSession \
            --parameters "{\"portNumber\":[\"${PORT}\"],\"localPortNumber\":[\"${PORT}\"]}" > /dev/null 2>&1 &
    done

    echo "SSM tunnel started."
}

# Start SSM tunnel
start_ssm_tunnel

# Sleep for 10 seconds before start the query
echo "Waiting for 10 seconds to ensure the tunnel is fully established..."
sleep 10

# Docker build image with Dockerfile
docker build -t $IMAGE_NAME .
if [ $? -ne 0 ]; then
    echo "Error building Docker image."
    exit 1
fi

# Start container
docker run -d --name $CONTAINER_NAME -v $PWD:/mnt $IMAGE_NAME
if [ $? -ne 0 ]; then
    echo "Error starting Docker container."
    exit 1
fi

# Check if query file exist
if [ ! -f $QUERY_FILE ]; then
    echo "Query file $QUERY_FILE does not exist."
    exit 1
fi

# Copy query file in container
docker cp $QUERY_FILE $CONTAINER_NAME:/tmp/queries.sql
if [ $? -ne 0 ]; then
    echo "Error copying query file to Docker container."
    exit 1
fi

# Executing query and save output
echo "Querying Spark..."
docker exec $CONTAINER_NAME beeline -u $HIVE_URL --silent=true --outputformat=csv2 -f /tmp/queries.sql | tail -n +2 > $TEMP_OUTPUT_FILE
if [ $? -ne 0 ]; then
    echo "Error executing query in Docker container."
    exit 1
fi

# Extract result form file
TOTAL_2023=$(awk -F',' '$1 == "2023" {print $2}' $TEMP_OUTPUT_FILE)
TOTAL_2024=$(awk -F',' '$1 == "2024" {print $2}' $TEMP_OUTPUT_FILE)

# Write result
echo "Numero di notifiche Visualizzate Totali 2023,$TOTAL_2023" >> $OUTPUT_DIR/$OUTPUT_FILE
echo "Numero di notifiche Visualizzate Totali 2024,$TOTAL_2024" >> $OUTPUT_DIR/$OUTPUT_FILE

# Remove Temp File
rm -rf $TEMP_OUTPUT_FILE

# Confirm
echo "Results Query on Spark have been written to $OUTPUT_DIR/$OUTPUT_FILE"
