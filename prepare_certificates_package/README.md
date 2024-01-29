# prepare_certificates_package

Script di preparazione dei file con il certificato da fornire periodicamente ad AdE e InfoCamere.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script riceve in input l'env name e genera due file .crt con i certificati da fornire ad InfoCamere ed AdE.

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-core-<env>
```

### Esecuzione
```bash
./index.sh <envName>
```
Dove:
- `<envName>` è il il nome dell'env (e.g. uat, prod)
