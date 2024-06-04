# retrive glacier file from a bucket

Effettua il retrive dei file da un bucket e prepara il file manifest.csv per l'utlizzo su s3 batch operations

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Esecuzione](#esecuzione)

## Descrizione

Lo Script, dato in input una coda DLQ, effettua le seguenti operazioni:
Lo Script, dati in input il bucket di destinazione, la tipologia di storage class ed il prefisso dei file genera un file manifest.csv che puo' essere utilizzato tramite AWS S3 Batch Operation per eseguire operazioni sul bucket, come ad esempio un retrive da Glacier


### Esecuzione
```bash
./retrive_glacier_from_ss.sh -p <aws-profile-name> -b <bucket-name> -s <storage-class> -r <prefixes>
```
Dove:
- `<aws-profile>` è il profilo dell'account AWS;
- `<bucket-name>` è il nome del bucket;
- `<storage-class>` è lo storage class dei file sui quale si vuole eseguire un'operazione
- `<prefixes>` prefissi dei file se si e' interessati a filtrare l'output

**Nota**:
Il file prodotto manifest.csv dovra' essere messo un bucket diverso da quello sul quale si vogliono effettuare le operazioni.