# substitute_github_token.sh

Bash script to update an existing secret on AWS Secrets Manager across multiple accounts linked to an environment.
The secret must already exist.

## Usage


```bash
./substitute_github_token.sh -r <region> -e <environment> -s <secret_name>
```

When you run the script, it will prompt you to enter the GitHub token as hidden input (not visible and not saved in the shell history).

### Parameters

* `-r` → AWS region
* `-e` → Environment (e.g., `dev`, `test`)
* `-s` → Secret name

