Script utilizzato per inserire in pn-Timelines degli eventi di notifica rifiutata in presenza di notifiche
bloccate in validazione, partendo dalle relative entry nella tabella pn-FutureAction

Intercetta i casi in cui mancano i file allegati alla notifica in SafeStorage (account confinfo).

script 1:
Parte dalle entries delle Future Action (account core) e le rimuove una volta creati gli elementi di
timeline per il rifiuto della notifica (account core).
Questo chiuderà le violationn di validazione in Progression Sensor (account core).

script 2:
Parte dalle entries di Progression Sensor (account core) e crea gli gli elementi di
timeline per il rifiuto della notifica (account core).
Questo chiuderà le violationn di validazione in Progression Sensor (account core).
In caso ci fossero FutureAction relative, non le rimuove, ma le logga.

richiede **Node.js 18.x.x**


# passo preliminare: eseguire login nei due ambienti confinfo-dev e core-dev
# (o i corretti account in base all'ambiente su cui si vuole intervenire)
```bash
aws sso login --profile sso_pn-confinfo-dev
aws sso login --profile sso_pn-core-dev
```

# passo preliminare: installazione dipendenze
```bash
npm install
```

# lancio script 1: partenza da FutureAction
```bash
npm run from-future-action
```

# lancio script 2: partenza da ProgressionSensor
```bash
npm run from-progression-sensor
```

# to do:
- Dockerfile