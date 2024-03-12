#! /bin/bash -e


AWS_PROFILE=sso_pn-core-prod-rw
AWS_REGION=eu-south-1


spark_ec2_instance_id=$( aws --profile ${AWS_PROFILE} --region ${AWS_REGION} \
    ec2 describe-instances \
    --filters 'Name=tag:usage,Values=spark'  \
    --output text --query 'Reservations[*].Instances[*].InstanceId' )

aws --profile ${AWS_PROFILE} --region ${AWS_REGION} \
    ssm start-session \
    --target "${spark_ec2_instance_id}" \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters '{"portNumber":["4040"],"localPortNumber":["4040"],"host":["127.0.0.1"]}' &

aws --profile ${AWS_PROFILE} --region ${AWS_REGION} \
    ssm start-session \
    --target "${spark_ec2_instance_id}" \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters '{"portNumber":["10100"],"localPortNumber":["10100"],"host":["127.0.0.1"]}' &



aws --profile ${AWS_PROFILE} --region ${AWS_REGION} \
    ssm start-session \
    --target "${spark_ec2_instance_id}" \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters '{"portNumber":["443"],"localPortNumber":["5601"],"host":["vpc-opensearchservi-bqkt8cyjx7kv-5onk33bdpiheq52de5plhfzx5i.eu-south-1.es.amazonaws.com"]}'