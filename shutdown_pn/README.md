## Shutdown or Startup PN

For use this script install command "fzf":

brew install fzf

The script is the script is interactive and you can select the components to stop

The shutdown script perform a shutdown of PN:
 - Set Lambda Concurrency to Zero (also disable Api-gateway)
 - Set number of task in all service in ECS cluster to Zero

The startup script perform a start of all Service of PN:
 - Remove Lambda Concurrency to Zero 
 - Set number of desired task = min number of task, if min number is not present the script set 1 to desired task


The script must be executed in the sharing AWS account:

`./shutdown_platform.sh [-p <aws-profile>] -r <aws-region>`
`./startup_platform.sh [-p <aws-profile>] -r <aws-region>`

where:
- aws-profile is the AWS profile of the sharing account
- aws-region is the AWS region the cloudwatch data are stored into