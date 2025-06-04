# redrive_prepare_analog

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
node index.js --envName <envName> --fileName <fileName> --statudCode [--dryrun] 
```
Dove:
- `<envName>` è l'environment si intende eseguire la procedura;
- `<fileName>` è il file-path del file che riporta la lista dei requestId ;
- `<statusCode>` è il codice status che si vuole risottomettere;

il file deve essere fornito nel seguente formato
PREPARE_ANALOG_DOMICILE.IUN_QQQQ-XGDQ-FFFF-202312-Q-1.RECINDEX_0.ATTEMPT_0.PCRETRY_0
PREPARE_ANALOG_DOMICILE.IUN_ZZZZ-XGDQ-QQQQ-202312-Q-1.RECINDEX_0.ATTEMPT_0.PCRETRY_0