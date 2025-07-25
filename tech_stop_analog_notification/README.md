# Tech stop analog notification

Script che esegue un blocco tecnico ad una serie di request id .

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Lo Script esegue un blocco tecnico in modo che tutti gli eventi che arrivano dal consolidatore vengono scartati e messi in DLQ.
Ciò consente di non compromettere la timeline di una notifica.
Il blocco avviene inserendo un event di tipo PN998/PN999 all'interno della event list di un requestId che essendo uno stato finale scarta tutti gli eventi successivi.
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
node index.js --envName <env-name> --fileName <file-name> --statusCode <status-code>
```
Dove:
- `<env-name>` l'ambiente su cui verrà eseguito lo script;
- `<file-name>` file che contiene i requestId completi di PC_RETRY;
- `<status-code>` lo status code error che si vuole impostare alla spedizione

IMPORTANTE: è necessario avviare il tunnel sull'ambiente di riferimento rif. https://pagopa.atlassian.net/wiki/spaces/PN/pages/706183466/Bastion+Host+SSM

