# substitute_github_token.sh

Bash script to update an existing secret on AWS Secrets Manager across multiple accounts linked to an environment.
The secret must already exist.

## Usage

```bash
./substitute_github_token.sh -t <token> -r <region> -e <environment> -s <secret_name>
```

### Parameters

* `-t` → Secret value
* `-r` → AWS region
* `-e` → Environment (e.g., `dev`, `test`)
* `-s` → Secret name

```

