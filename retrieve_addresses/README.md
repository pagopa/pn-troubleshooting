# retrieve_addresses
## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo script legge un CSV di codici fiscali / partite IVA e invoca national-registries
tramite tunnel. Per default usa il flusso di ricerca indirizzi; con `--registry inad`
interroga esclusivamente INAD, ottenendo la risposta sincrona del registro.

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare 

```bash
aws sso login --profile <core-profile>
aws sso login --profile <confinfo-profile>
```


Avviare tunneling SSM tramite una EC2 dell'account AWS Core e dell'account AWS Confinfo verso gli ALB (fare riferimento alla [guida](https://pagopa.atlassian.net/wiki/spaces/PN/pages/706183466/Bastion+Host+SSM))

Aggiornare o creare il file .env con il valore ALB_BASE_URL e ALB_CONFIDENTIAL_URL in base alla porta locale impostata, ad es. 
ALB_BASE_URL=http://localhost:8080
ALB_CONFIDENTIAL_URL=http://localhost:8081

### Esecuzione
```bash
node index.js --fileName <fileName> --receiverType <PF|PG> --domicileType <PHYSICAL|DIGITAL> [--referenceRequestDate <ISO-date>] [--taxIdColumn <column>] [--delimiter <delimiter>] [--delay <milliseconds>]

# Solo INAD
node index.js --fileName <fileName> --receiverType PF --registry inad --delay 500
```
Dove:
- `<fileName>` è il path del CSV che contiene i codici fiscali / partite IVA.
- `<receiverType>` è il tipo destinatario: `PF` o `PG`.
- `<domicileType>` è la tipologia di domicilio: `PHYSICAL` o `DIGITAL`.
- `--registry inad` (opzionale, non sensibile a maiuscole/minuscole) seleziona
  `POST /national-registries-private/{receiverType}/inad/digital-address`.
  In questa modalita `--domicileType` puo essere omesso oppure essere `DIGITAL`;
  `PHYSICAL` e registri diversi da INAD sono rifiutati prima di leggere il CSV.
  Il body contiene solo `filter.taxId` e `filter.practicalReference`: quest'ultimo
  e il `correlationId` generato per la riga (`SEND-<uuid>`), come scelta operativa
  dell'utente. La data di ricerca non viene inviata a INAD.
- `<referenceRequestDate>` (opzionale) è la data di ricerca; default: data corrente.
- `<taxIdColumn>` (opzionale) è la colonna del CSV con il taxId; default: `codice_fiscale`.
- `<delimiter>` (opzionale) è il separatore del CSV; default: `,`.
- `--delay` (opzionale) imposta la pausa in millisecondi dopo ogni chiamata,
  anche in caso di 404 o errore, prima di procedere alla successiva.
  Default: `100`; `0` disabilita la pausa. Sono ammessi solo interi da `0`
  a `2147483647` (limite dei timer Node.js). La durata della chiamata si aggiunge
  alla pausa; le chiamate restano sequenziali, sia per INAD sia per il flusso standard.

Gli esiti vengono salvati in `results/<timestamp>/`, un oggetto JSON per riga:
- `success.json`: richieste riuscite.
- `notfound.json`: risposte HTTP 404, con `taxId`, `correlationId`,
  `status: "notfound"` e `response` contenente lo stato HTTP e il body ricevuto.
- `failure.json`: tutti gli altri errori.

La classificazione dei 404 si applica sia a INAD sia al flusso standard.
I file vengono creati solo quando si verifica il relativo esito.
Per INAD, `response` contiene la risposta sincrona del registro, non il solo
riscontro di presa in carico del flusso standard.
