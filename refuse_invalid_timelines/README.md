Script utilizzato per inserire in pn-Timelines degli eventi di notifica rifiutata in presenza di notifiche
bloccate in validazione, partendo dalle relative entry nella tabella pn-FutureAction

Intercetta i casi in cui mancano i file allegati alla notifica in SafeStorage (account confinfo).

Parte dalle entries delle Future Action (account core) e le rimuove una volta creati gli elementi di
timeline per il rifiuto della notifica (account core).

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

# lancio script
```bash
npm run generate-report
```

# to do:
- Dockerfile