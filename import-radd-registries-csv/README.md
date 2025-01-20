## Istruzioni script di import massivo

## esecuzione

1. Eseguire il tunnelling verso il bilanciatore di pn-core.

2. Eseguire il comando:

    ```
    ./registries-import.sh "{CSV_PATH}" "{API_BASE_URL}" "{CX_ID}" "{UID}"
    ```
   sostituendo i placeholder come segue:

     - CSV_PATH = percorso del file CSV da importare
     - API_BASE_URL = base url dell'API di pn-core (es. http://localhost:8888 se il tunnel è stato aperto sulla porta 8888)
     - CX_ID = codice fiscale dell'ente RADD
     - UID

## verifica

- Recuperare da console il REQUEST_ID

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
