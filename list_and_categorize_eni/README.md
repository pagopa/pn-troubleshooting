## List and Categorize Eni on AWS accounts

The script analyze and create a list of network interface in AWS.

Usage:

`./list_eni.sh [-p <aws-profile_core>] [-c <aws-profile_confinfo>]  [-e <pn-env>] -r <aws-region>`

where:
- aws-profiles (core and confinfo) are the AWS profiles of the sharing account
- pn-env is the environment to analyze (es. hotfix, prod ecc....)
- aws-region is the AWS region the cloudwatch data are stored into

