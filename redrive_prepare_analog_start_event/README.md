# redrive_prepare_analog_start_event

Script di sottomissione dell'evento iniziale di prepare analag

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script, dato in input un file che contiene i requestId esegue la risottomissione per riavviare il processo di inizializzazione della prepare.

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

### Esecuzione
```bash
node index.js --envName <envName> --fileName <fileName> [--dryrun]
```
Dove:
- `<envName>` è l'environment sul quale si intende effettuare la risottomissione; 
- `<fileName>` è il path del file che contiene i requestId.
- `<dryrun>` opzionale: non esegue la sottomissione in coda.