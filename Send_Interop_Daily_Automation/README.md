# Script di automazione di attivazione di finalita' e fruzione send:

1 - activate_finalia_send.sh 
2 - activate_fruizione_send.sh

Requisiti: bash e jq

# metodo di esecuzione:
Per entambi gli script serve staccarsi un token di auth dal portale interop, per il solo script delle richieste di fruzione anche un api-key di selfare. Gli script sono interattivi, chiedono queste variabili all' utente durante lo script.

# Avvio 
./activate_finalia_send.sh
./activate_fruizione_send.sh

# Script di automazione di attivazione di finalita'

 Lo Script di automazione activate_finalia_send.sh  attiva in modo automatico tutte le finalita' con un numero strettamente inferiore a 20K di chiamate giornaliere.  Prima lo script scarica la lista e poi procede all'approvazione

# Script di automazione di richieste di fruizione:

Lo Script di automazione activate_fruizione_send.sh  attiva in modo automatico tutte le richieste di fruizione degli enti che effettivamente possono farne richiesta. La logica dello script e' di arricchire con tutte le info necessarie il file "pending_fruizione_filtered.json" in particolare si articola nei seguenti passi:

1 - scarica la lista delle richieste di fruzione
2 - ricava il selfcareID
3 - tramite il selfcareID verifica che esistano le due condizioni prod-pn ACTIVE e prod-interop ACTIVE, restituendo in ogni caso nel json        "pending_fruizione_filtered.json" le condizioni mancanti per il NON procedere all'attivazione
4 - procede all'attivazione degli enti che hanno nel json "pending_fruizione_filtered.json" la condizione "pn+pdnd": "ok", ogni operazione di attivazione e' tracciata nel log activation_log.txt.
