# Tech stop analog notification

Script che esegue un blocco tecnico ad una serie di request id .

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Lo Script esegue un blocco tecnico in modo che tutti gli eventi che arrivano dal consolidatore vengono scartati e messi in DLQ.
Ciò consente di non compromettere la timeline di una notifica.
Il blocco avviene inserendo un event di tipo PN999 all'interno della event list di un requestId che essendo uno stato finale scarta tutti gli eventi successivi.
## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-confinfo-<env>
```

### Esecuzione
```bash
node index.js --envName <env-name> --fileName <file-name>
```
Dove:
- `<aws-profile-dev>` è il profilo dell'account AWS dev;
- `<aws-profile-conf>` è il profilo dell'account AWS confinfo;
- `<request-id>` è il request id del messaggio desiderato;
- `<format>` è il formato dell'output, può essere "raw" o "compact"



