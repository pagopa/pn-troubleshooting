#! /bin/bash -e


AWS_PROFILE=cons_admin_try_spark
AWS_REGION=eu-south-1


spark_ec2_instance_id=$( aws --profile ${AWS_PROFILE} --region ${AWS_REGION} \
    ec2 describe-instances \
    --filters 'Name=tag:usage,Values=spark'  \
    --output text --query 'Reservations[*].Instances[*].InstanceId' )

aws --profile ${AWS_PROFILE} --region ${AWS_REGION} \
    ec2 start-instances \
    --instance-ids "${spark_ec2_instance_id}" 

aws --profile ${AWS_PROFILE} --region ${AWS_REGION} \
    ssm start-session \
    --target "${spark_ec2_instance_id}" \
    --document-name AWS-StartPortForwardingSession \
    --parameters '{"portNumber":["4040"],"localPortNumber":["4040"]}' &

aws --profile ${AWS_PROFILE} --region ${AWS_REGION} \
    ssm start-session \
    --target "${spark_ec2_instance_id}" \
    --document-name AWS-StartPortForwardingSession \
    --parameters '{"portNumber":["10100"],"localPortNumber":["10100"]}' &



