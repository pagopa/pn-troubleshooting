# Retry legal conservation

Genera e/o invia un evento per reinviare in conservazione uno o più documenti.

## Utilizzo

```bash
./index.sh -r <aws-region> -p <aws-profile> -f <json-file> [-i <invoke>]
```
Dove:
- `<aws-profile>` è il profilo dell'account AWS dell'ambiente di riferimento.
- `<aws-region>` é la region AWS dove risiede lo user pool Cognito
- `<invoke>` indica la richiesta di invocare la lambda pn-legalConservationStarter
- `<json-file>` è il file che contiene i documenti di input da ritrasmettere (si veda il file `tpl/example-input.json`)

## Esempio

Senza invocazione della lambda
```bash
./index.sh -p sso_pn-confinfo-dev -r eu-south-1 -f ./tpl/example-input.json
```

Con invocazione della lambda
```bash
./index.sh -p sso_pn-confinfo-dev -r eu-south-1 -f ./tpl/example-input.json -i
```
