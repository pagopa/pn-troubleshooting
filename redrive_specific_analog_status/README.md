# redrive_specific_analog_status

Script che risottomette un evento della eventList specifico

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script che risottomette un evento della eventList specifico

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
node index.js --envName <envName> --fileName <fileName> --statusCode [--dryrun] 
```
Dove:
- `<envName>` è l'environment si intende eseguire la procedura;
- `<fileName>` è il file-path del file che riporta la lista dei requestId ;
- `<statusCode>` è il codice status che si vuole risottomettere;

il file deve essere fornito nel seguente formato
PREPARE_ANALOG_DOMICILE.IUN_QQQQ-XGDQ-FFFF-202312-Q-1.RECINDEX_0.ATTEMPT_0.PCRETRY_0,2024-08-28T09:53:08Z
PREPARE_ANALOG_DOMICILE.IUN_ZZZZ-XGDQ-QQQQ-202312-Q-1.RECINDEX_0.ATTEMPT_0.PCRETRY_0,2024-08-28T09:53:08Z