## Shutdown PN

For use this script install command "fzf":

brew install fzf

The script is the script is interactive and you can select the components to stop

This script perform a shutdown of PN:
 - Set Lambda Concurrency to Zero (also disable Api-gateway)
 - Set number of task in all service in ECS cluster to Zero

The script must be executed in the sharing AWS account:

`./log_errors_extractor.sh [-p <aws-profile>] -r <aws-region>`

where:
- aws-profile is the AWS profile of the sharing account
- aws-region is the AWS region the cloudwatch data are stored into