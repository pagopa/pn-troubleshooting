## Istruzioni script di import massivo

## Esecuzione

1. Eseguire il tunnelling verso il bilanciatore di pn-core:

    ```bash
    aws sso login --profile <profilo AWS>

    aws ssm start-session \
	--target "<Target>"
	--document-name AWS-StartPortForwardingSessionToRemoteHost \
	--profile "<profilo AWS>"
	--parameters "{
		\"portNumber\":[\"8080\"],
		\"localPortNumber\":[\"8888\"],
		\"host\":[\"<Host>\"]
	}"
    ```

    Dove:
    - **Target** è l'ID dell'istanza EC2 utilizzata come Bastion;
    - **Host** è il DNS name del Load Balancer 'EcsA-...'.

    **NB**: Non chiudere il terminale utilizzato per eseguire questi comandi fino a quando non saranno terminate le
    operazioni di import tramite lo script registries-import.sh;

2. Eseguire il comando:

    ```bash
    ./registries-import.sh "{CSV_PATH}" "{API_BASE_URL}" "{CX_UID}"
    ```
   sostituendo i placeholder come segue:

     - CSV_PATH = percorso del file CSV da importare
     - API_BASE_URL = base url dell'API di pn-core (es. http://localhost:8888 se il tunnel è stato aperto sulla porta 8888)
     - CX_UID = ID associato all'operazione in corso

## Verifica

- Recuperare da console, o dal file fornito in output dallo script, il REQUEST_ID

    ```
    Richiesta di import massivo completata.
    REQUEST_ID: b62847b6-31d6-43f6-8f8d-0c3959c4dd56
    ```
- eseguire una query sulla tabella ```pn-RaddRegistryImport``` utilizzando come come partitionKey il ```CX_ID``` e come sortKey il ```REQUEST_ID```
   
- Attendere il passaggio di stato della richiesta di import a ```DONE ```, e proseguire con le verifiche sulle singole sedi importate
   
- eseguire una query sull'indice ```cxId-requestid-index``` della tabella ```pn-RaddRegistryRequest``` utilizzando come partitionKey il ```CX_ID``` 
  e come sortKey il ```REQUEST_ID``` al fine di verificare lo stato di ogni singola richiesta di censimento:
  
    - Le richieste in stato ```ACCEPTED``` saranno memorizzate nella tabella ```pn-RaddRegistry```
    - Le richieste in stato ```REJECTED``` saranno scartate e l'item sulla tabella conterrà la motivazione dello scarto (campo error).
    - Le richieste in stato ```DELETED``` indicano che una vecchia richiesta di censimento è stata sostituita dalla nuova. (es.richiesta di import successiva alla prima)
   
- eseguire una query sull'indice ```cxId-requestid-index``` della tabella ```pn-RaddRegistry``` utilizzando come come partitionKey il ```CX_ID```
  e come sortKey il ```REQUEST_ID``` al fine di verificare che le sedi radd siano state memorizzate correttamente.
