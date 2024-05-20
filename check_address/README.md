# Edit Paper address information

Script di generazione hash per la modifica di un receiver address.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

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

### Output
Lo script genera una cartella in `edits/{request_id}_{yyyy-MM-dd'T'HH:mm:ss. SSSXXX}` con i seguenti file:
- **originalAddress.json**: indirizzo originale
