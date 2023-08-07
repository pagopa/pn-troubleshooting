# Edit Paper address information

Script di generazione hash per la modifica di un receiver address.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Script interattivo che genera la codifica di un receiver address di un invio analogico avendo come input un requestId.
Una volta generati i campi di interesse, è possibile modificare manualmente le tabelle in `pn-paper-address` e `pn-paper-request-delivery`
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
node index.js --awsCoreProfile <aws-core-profile> --envType <env-type> --requestId <request-id> [--update]
```
Dove:
- `<aws-profile>` è il profilo dell'account AWS;
- `<env-type>` è l'ambiente sul quale si vuole avviare lo script;
- `<request-id>` è il request id del messaggio desiderato.
- `--update` indica se con lo script si vuole modificare dei dati in maniera automatica in DynamoDB. (usare con cautela)

### Output
Lo script genera una cartella in `edits/{request_id}_{yyyy-MM-dd'T'HH:mm:ss. SSSXXX}` con i seguenti file:
- **originalAddress.json**: indirizzo originale
- **updatedAddress.json**: indirizzo aggiornato secondo gli input in fase di esecuzione
- **updatedEncryptedAddress.json**: valori crittografati dell'indirizzo aggiornato
- **updatedAddressHash.json**: hash dell'indirizzo aggiornato
- **paperAddress.json**: entita pn-PaperAddress precedente all'aggiornamento in formato raw DynamoDB
- **updatedPaperAddress.json**: entita pn-PaperAddress aggiornata con i valori codificati ed in formato raw DynamoDB
- **paperRequestDelivery.json**: entità pn-PaperRequestDelivery con la property `addressHash` aggiornata ed in formato raw DynamoDB
- **addressDiff.diff**: diff tra originalAddress.json e updatedAddress.json