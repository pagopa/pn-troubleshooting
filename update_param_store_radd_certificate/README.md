# update_param_store_certificate

## Descrizione

Dato in input il dump JSONL (vedi [dump_dynamodb](https://github.com/pagopa/pn-troubleshooting/tree/main/dump_dynamodb)) della tabella DynamnoDB `pn-AuthJwtIssuers` (account AWS core), lo script:

1. Estrae le righe che rispettano contemporanmente le condizioni:
    1. la Partition Key `hasKey` non deve contendere alla fine del suo valore la stringa “DISABLED“;
    2. la Sort Key `sortKey` deve avere valore “CFG“;
2. recupera, per ogni item al punto precedente:
    1. `<iss>` uguale alla Partition Key;
    2. `<domain>` dal campo `JWKSUrl`;
3. utilizza i valori al punto precedente per costriure un array JSON del tipo:
```jq
[
  {
    "iss": "<iss>",
    "domain": "<domain>"
  },
  ...
  {
    "iss": "<iss>",
    "domain": "<domain>"
  }
]
```
4. stampa a video l’array creato al punto precedente;
5. crea/sostituisce il contenuto del parametro `paramStoreName` con quello del nuovo array in base ai flag abilitati in fase di esecuzione dello script.

## Utilizzo

1. Esecuzione dello script [dump_dynamodb](https://github.com/pagopa/pn-troubleshooting/tree/main/dump_dynamodb) utilizzando il flag `--json`:

```bash
cd <workdir>/pn-troubleshooting/dump_dynamodb
node index.js \
  --awsProfile <aws-profile core> \
  --tableName pn-AuthJwtIssuers \
  --json

```
2. Esecuzione dello script node:
```bash

cd <workdir>/pn-troubleshooting/update_param_store_radd_certificate
node ./index.js  \
  --env=<env> \ # Required
  --paramStoreName=<paramStoreName> \ # Required
  --inputFile=<output dump_dynamodb 'pn-AuthJwtIssuers'> \ # Required
  --dryRun=<true|false> \
  --overwrite=<true|false> # default: false

```
Dove:
- `env` è l'ambiente di esecuzione dello script;
- `paramStoreName` è il nome del parametro da creare/sostituire;
- `inputFile` è il file di input ottenuto utilizzando lo script `dump_dynamodb` sulla tabella `pn-AuthJwtIssuers`;
- `dryRun` è di tipo `Boolean` e permette di visualizzare il nuovo contenuto del parametro senza applicare nessuna modifca;
- `overwrite` è di tipo `Boolean` e se attivo permette di sovrascrivere il valore del parametro esistente con quello appena generato, altrimenti creerà un nuovo parametro.
