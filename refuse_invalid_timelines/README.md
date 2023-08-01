# Scan on DynamoDB table

Script per rifiutare le notifiche che si sono bloccate durante il processo di validazione.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script utilizzato per inserire in pn-Timelines degli eventi di notifica rifiutata in presenza di notifiche
bloccate in validazione, partendo dalle relative entry nella tabella pn-FutureAction o da quelle in
pn-ProgressionSensorData (ci sono due diversi script lanciabili).

Intercetta i casi in cui mancano i file allegati alla notifica in SafeStorage (account confinfo) e per questi
produce un elemento di timeline di rifiuto della notifica.

Script 1:
Parte dalle entries delle Future Action (account core) e le rimuove una volta creati gli elementi di
timeline per il rifiuto della notifica (account core).
Questo chiuderà le violationn di validazione in Progression Sensor (account core).

Script 2:
Parte dalle entries di Progression Sensor (account core) e crea gli gli elementi di
timeline per il rifiuto della notifica (account core).
Questo chiuderà le violationn di validazione in Progression Sensor (account core).
In caso ci fossero FutureAction relative, non le rimuove, ma le logga.

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

### Script 1: partenza da FutureAction
```bash
npm run from-future-action
```

### Script 2: partenza da ProgressionSensor
```bash
npm run from-progression-sensor
```