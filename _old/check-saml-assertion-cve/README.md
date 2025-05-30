## DESCRIPTION
The script decrypts the SPID saml requests in the  `assertions`  folder and verifies eventual issues with CVE:
- https://github.com/node-saml/xml-crypto/security/advisories/GHSA-x3m8-899r-f7c3
- https://github.com/node-saml/xml-crypto/security/advisories/GHSA-9p8x-f768-wp2g

The generated  `report.json` has a structure like:
```
{"file":"_00047a92ddd37dbee947-2025-03-17.json","cve1Res":false,"cve2Res":false,"compromised":false}
```

The script assumes that the private key used to encrypt SAML assertion is stored into `private.pem` file.

### PRIVATE KEY FILE DUMP ###

```
LogsPrivateKey=$(aws \
    --profile "sso_pn-confinfo-prod" \
    --region "eu-south-1" \
    secretsmanager get-secret-value \
    --no-paginate \
    --secret-id pn-prod-hub-login-logs \
    --query SecretString --output text |  jq -r '.LogsPrivateKey')

LOCAL_PRIVATE_KEY=private.pem
    
LF=$'\\\x0A'
echo $LogsPrivateKey | sed -e "s/-----BEGIN PRIVATE KEY-----/&${LF}/" -e "s/-----END PRIVATE KEY-----/${LF}&${LF}/" | sed -e "s/[^[:blank:]]\{64\}/&${LF}/g" | sed -e "s/^ //"> $LOCAL_PRIVATE_KEY
```

## INSTALL
`npm install` 

## RUN

`node index.js`

