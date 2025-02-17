# Send to pn-ec

**consolidatore_con020.sh**
    è lo script originale

**consolidatore_con020_PARAM.sh**
    è una versione customizzata con parametrizzazione PA ID, AAR, documenti e indirizzi di spedizione

    questo è studiato in modo che AAR (con SHA), attachment (con SHA) e indirizzi (a cui viene aggiunto il prefisso per il consolidatore) vengano presi da array
    
        agendo sul codice, si può far si che i documenti vengano ciclati e resettati a ogni chiamata della funzione, oppure che il ciclo continui a incrementare anche tra chiamate (in ogni caso viene usato l'operatore modulo per ripartire dall'inizio dell'array una volta che si arriva alla fine)


Sono pensati per essere configurati modificando gli script e lanciandoli senza parametri.
