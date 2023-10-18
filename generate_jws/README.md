## Generate JWS per Infocamere

`node index.js <aws-profile> <client-id>`

Dove:
- `<aws-profile>` è il profilo AWS
- `<client-id` è il client ID di InfoCamere da utilizzare per generare il JWS

Note:
- la regione è fissa su `eu-south-1`
- i dati per la generazione vengono letti dal parametro SSM `/pn-national-registries/infocamere-cert-next`