## DECRYPT SAML REQUEST

`./decrypt.sh <aws-profile> <env> <saml-request-path>`

Where:
- `<aws-profile>` is the AWS profile allowed to get secrets from target AWS account
- `<env>` is the PN platform environment (dev, test, uat, hotfix, prod)
- `<saml-request-path>` is the SAML assertion file to decrypt

The script generates the decrypted SAML assertion file in the same path of the encrypted one with the `-decrypted` suffix.