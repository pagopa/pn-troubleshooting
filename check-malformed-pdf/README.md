# Check Legal Facts malformed

Script di verifica che i documenti estratti da "list-for-check-malformed-pdf" siano effettivamente malformed.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script riceve in input il file risultante dall'esecuzione di "list-for-check-malformed-pdf"; per ogni riga, che contiene un documento prodotto da delivery push di tipo DIGITAL_DELIVERY, verifica che:
- il documento sia disponibile su S3 (nei casi in cui il file è già transitato su GLACIER, il processo prosegue oltre)
- il documento non contiene la stringa "Nome e Cognome": in tal caso viene riportato come "malformed" per via del bug https://pagopa.atlassian.net/browse/PN-8997
- il documento contiene un numero differenti di occorrenze della stringa "Nome e Cognome" rispetto al numero di elementi di Timeline di tipo SEND_DIGITAL_FEEDBACK per il RecIndex specificato nella riga del file di input: in tal caso viene riportato come "malformed" per via del bug https://pagopa.atlassian.net/browse/PN-8719

Per eseguire le verifica, viene scaricato il documento dal bucket S3 di SafeStorage; tutti i documenti "conformi" vengono eliminati al termine della verifica. 
Per ogni documento viene estratto il testo per eseguire le verifiche di conformità, grazie ad una libreria nodejs (https://github.com/zetahernandez/pdf-to-text) che utilizza alla base "xpdf".

## Installazione

Prerequisito è aver installato xpdf.

```bash
npm install
```

## Utilizzo

```bash
node index.js <env> <input-file-path> <safe-storage-bucket>
```
Dove:
- `<env>` è l'ambiente sul quale eseguire la verifica
- `<input-file-path>` è il path al file di input con il dump delle righe della tabella DynamoDB pn-DocumentCreationRequest
- `<safe-storage-bucket>` è il nome del bucket per l'ambiente sul quale si deve eseguire la veriica

## Output
Lo script stampa sullo stdout una riga per ogni documento verificato ed evidenzia con un messaggio dedicato:
- i documento "malformed"
- i documenti presenti solo su GLACIER

Lo script memorizza i documenti "malformed" in una cartella `/tmp/<env>-<timestamp>`