# inipec_error_report

## Tabella dei Contenuti

- [Descrizione](#Descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo script 'main.sh' viene utilizzato per:
1. richiamare lo script check_nr_response;
2. eleborare l'output del punto precedente;
3. eseguire lo script inipec_error_report con input il risultato al punto 2.

Dato in input il risultato al punto 2, le operazioni eseguite dallo script inipec_error_report sono:
- eseguere una query sulla tabella pn-BatchPolling, sull’indice status-index, con la condizione status = ERROR; 
- recuperare i batchId con lastReserved maggiore o uguale alla data dell’ultimo redrive;
- Per ogni batchId, eseguire una query sulla tabella pn-batchRequests, sull'indice batchId-lastReserved-index, per recuperare tutti i pollingId che hanno almeno un elemento (correlationId) tra quelli estratti dallo script check_nr_response.
- creare un file del tipo ./results/inipec_error_report_<timestamp>.json contenenti pollingId e taxId impattati.

## Installazione

```bash
npm install
```

## Utilizzo

```bash

./main <env> <dump pn-national_registry_gateway_inputs-DLQ>

```
