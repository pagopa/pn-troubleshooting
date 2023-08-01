# Edit Paper address information

Script di generazione hash per la modifica di un receiver address.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Script interattivo che genera la codifica di un receiver address di un invio analogico avendo come input un requestId.
Una volta generati i campi di interesse modificare manualmente le tabelle in `pn-paper-address` e `pn-paper-request-delivery`
## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-core-<env>
```

### Esecuzione
```bash
node index.js --awsCoreProfile <aws-core-profile> --envType <env-type> --requestId <request-id>
```
Dove:
- `<aws-profile>` è il profilo dell'account AWS;
- `<env-type>` è l'ambiente sul quale si vuole avviare lo script;
- `<request-id>` è il request id del messaggio desiderato.



