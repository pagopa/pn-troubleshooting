# Controllo corretto utilizzo degli stream

Questa directory contiene gli script per controllare il corretto utilizzo degli stream da parte dei partner tecnologici.

Lo script _checkStreamPolling.sh_ conta quante occorrenze del log di delivery push sono state fatte in un determinato lasso di tempo
e produce l'output su file _polling-count.txt_ ordinato per la PA che fa maggior numero di richieste.

Lo script _checkLastEventId.sh_ data la PA_ID in ingresso visualizza le righe di log.

Ad esempio

```
2023-08-11T15:00:57.113Z, consumeEventStream requestEventId=null streamId=a8cc29c4-f05d-4f78-97d8-2c3d1f6b45f5 size=0 returnedlastEventId=ND retryAfter=60000
2023-08-11T15:02:08.071Z, consumeEventStream requestEventId=null streamId=a8cc29c4-f05d-4f78-97d8-2c3d1f6b45f5 size=0 returnedlastEventId=ND retryAfter=60000
2023-08-11T15:03:19.076Z, consumeEventStream requestEventId=null streamId=a8cc29c4-f05d-4f78-97d8-2c3d1f6b45f5 size=0 returnedlastEventId=ND retryAfter=60000
2023-08-11T15:04:29.719Z, consumeEventStream requestEventId=null streamId=a8cc29c4-f05d-4f78-97d8-2c3d1f6b45f5 size=0 returnedlastEventId=ND retryAfter=60000
2023-08-11T15:05:42.638Z, consumeEventStream requestEventId=null streamId=a8cc29c4-f05d-4f78-97d8-2c3d1f6b45f5 size=0 returnedlastEventId=ND retryAfter=60000
2023-08-11T15:06:52.187Z, consumeEventStream requestEventId=null streamId=a8cc29c4-f05d-4f78-97d8-2c3d1f6b45f5 size=0 returnedlastEventId=ND retryAfter=60000
2023-08-11T15:08:04.057Z, consumeEventStream requestEventId=null streamId=a8cc29c4-f05d-4f78-97d8-2c3d1f6b45f5 size=0 returnedlastEventId=ND retryAfter=60000
```

E visulizza al termine la PA correispondete all'idetificativo passato come parametro

Esempio di utilizzo:

`./checkStreamPolling.sh sso_pn-core-uat`

Controllando il file _polling-count.txt_

```
 105 d7d441ea-dbd5-4c49-bb5f-12821558c6fe
   4 54616d97-8828-40f6-99a5-5fdeae7be182
   2 3f68cee8-fc14-4da5-8571-f47e693e6068
   1 f13b121b-5ad6-4019-998d-d857f27f9767
```

Quindi la pa con id _d7d441ea-dbd5-4c49-bb5f-12821558c6fe_ ha fatto 105 chiamate in 10 minuti

Lancio 
`./checkLastEventId.sh sso_pn-core-uat d7d441ea-dbd5-4c49-bb5f-12821558c6fe`

per avere conferma delle chiamate e la decodifica del PA (descrizione e codice IPA)

