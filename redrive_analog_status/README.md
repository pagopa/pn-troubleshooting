# redrive_analog_status

Script che risottomette una prepare di un flusso analogico bloccata iun stato RECAG012

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script che recupera le informazioni dalla tabella pn-EcRichiesteMetadati e individua gli eventi che hanno un evento RECAG012 bloccato.

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-confinfo-<env>
aws sso login --profile sso_pn-core-<env>
```

### Esecuzione
```bash  
node index.js --envName <envName> --fileName <fileName> --statusCode <statusCode> [--dryrun]
```
Dove:
- `<envName>` è l'environment si intende eseguire la procedura;
- `<fileName>` è il percorso del file di input;
- `<statusCode>` è il codice status che si vuole risottomettere, obbligatorio solo per il formato senza intestazione;

Il formato senza intestazione contiene una richiesta per riga:

```text
PREPARE_ANALOG_DOMICILE.IUN_QQQQ-XGDQ-FFFF-202312-Q-1.RECINDEX_0.ATTEMPT_0.PCRETRY_0,2026-10-07T17:00:00Z
```

In alternativa, viene riconosciuto automaticamente un CSV con separatore `;`
e queste intestazioni:

```csv
requestid;fine_recapito_stato_silver;fine_recapito_data_silver
PREPARE_ANALOG_DOMICILE.IUN_QQQQ-XGDQ-FFFF-202312-Q-1.RECINDEX_0.ATTEMPT_0.PCRETRY_0;RECRN005C;2026-10-07T17:00Z
```

```bash
node index.js --envName <envName> --fileName <file.csv> --dryrun
```

Nel CSV lo statusCode viene letto da ogni riga; un eventuale `--statusCode`
non sovrascrive i valori del file. Il parser di `pn-common` gestisce BOM UTF-8,
terminatori Windows, righe vuote e campi tra virgolette. Tutti i record sono
validati prima delle chiamate AWS.

Il confronto delle date considera equivalenti `17:00Z` e `17:00:00Z`.
Le richieste senza eventi corrispondenti vengono registrate in `skipped.json`;
quelle con feedback gia presente in `analogFeedback_.json`.

### Log

La console mostra una riga iniziale con ambiente, numero di richieste, modalita
dry-run e cartella dei risultati. Per ogni richiesta viene stampata una sola
riga con avanzamento, requestId, statusCode, timestamp ed esito:
`SENT`, `DRYRUN would-send` oppure `SKIP` con il motivo.
Non vengono stampati i payload; i dettagli restano nei report su file.
Il riepilogo finale distingue invii effettivi, simulazioni e richieste saltate
per motivo. Gli errori continuano a essere mostrati e interrompono l'esecuzione
con codice di uscita diverso da zero.