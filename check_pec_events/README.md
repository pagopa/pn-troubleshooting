# Check PEC events

Script di verifica degli eventi relativi ad un evento pec SEND_DIGITAL

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script, dato in input un file che corrisponde all'estrazione di un dump della coda pn-ec-tracker-pec-errori-queue-DLQ.fifo, verifica se per un detereminato requestId si sono verificati tutti gli eventi previsti.

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile <profile>
```

### Esecuzione
```bash
node index.js --envName <envName> --fileName <fileName>
```
Dove:
- `<envName>` è l'environment nel quale si intende effettuare il controllo;
- `<fileName>` è il path del file che contiene il dump della coda.