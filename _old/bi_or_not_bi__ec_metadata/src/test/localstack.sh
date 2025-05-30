#! /bin/bash -e

AWS_URL_ENDPOINT=http://localhost:4566
AWS_S3_BUCKET=test-bucket

CSV_FILE=./resources/s3-sources/sample.csv

### Make S3 Bucket ###
echo "Creating S3 bucket: < ${AWS_S3_BUCKET} >"
aws s3 mb s3://${AWS_S3_BUCKET} --endpoint-url ${AWS_URL_ENDPOINT}

### Put File ###
echo "Uploading file to S3: ${CSV_FILE}"
aws s3 cp ${CSV_FILE} s3://${AWS_S3_BUCKET} --endpoint-url ${AWS_URL_ENDPOINT}