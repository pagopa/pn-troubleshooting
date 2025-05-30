# Script di estrazione dati

## addressBookCount

Restituisce il numero di:
1. Attivazioni APP IO (NOTA: sia attivazione che disattivazioni, aggiungere `addresshash=ENABLED`)
2. Domicili di Piattaforma (PEC) generiche (non conta quelli per specifica PA)
3. Email impostate per messaggi di cortesia (non conta quelli per specifica PA)
4. SMS numeri di cellulare per messaggi di cortesia (non conta quelli per specifica PA)

Istruzioni

`node addressBookCount.js <profile>`
