# Get Notification Attachment

Script per la verifica e il ripristino degli allegati delle notifiche tramite IUN.

## Tabella dei Contenuti

* [Descrizione](#descrizione)
* [Utilizzo](#utilizzo)
  * [Preparazione](#preparazione)
  * [Esecuzione](#esecuzione)
  * [Modalità Ripristino](#modalità-ripristino)
* [Output](#output)

## Descrizione

Questo script consente di:

* Verificare la presenza e lo stato degli allegati delle notifiche, dati una lista di IUN (uno per riga in un file di testo).
* Opzionalmente, ripristinare gli allegati eliminati (rimozione dei delete marker su S3) e aggiornare lo stato sulla `pn-SsDocumenti`.

Per ogni IUN fornito:

1. Legge il file di input contenente gli IUN (uno per riga).
2. Recupera la notifica associata e il relativo allegato (`documentKey`).
3. Verifica la presenza di delete marker per l'allegato sul main bucket di SafeStorage.
4. Recupera lo stato logico e fisico del documento dalla `pn-SsDocumenti`.
5. Scrive un file CSV riepilogativo con i risultati.
6. In modalità ripristino (`--restore`), rimuove i delete marker e aggiorna lo stato sulla `pn-SsDocumenti`, producendo file TXT con gli IUN processati.

## Utilizzo

### Preparazione

Effettuare il login AWS per il profilo desiderato:

```bash
aws sso login --profile sso_pn-core-<env>
```

### Esecuzione

```bash
node index.js --envName <env> --inputFile <percorso_file>
```

```bash
node index.js -e <env> -f <percorso_file>
```

Dove:

* `<env>` è l'ambiente di destinazione: dev, uat, test, prod, hotfix
* `<percorso_file>` è il percorso al file di testo contenente gli IUN da analizzare (uno per riga)

Esempio:

```bash
node index.js -e dev -f ./IUNs.txt
```

### Modalità Ripristino

Per rimuovere i delete marker dagli allegati e aggiornare lo stato sulla `pn-SsDocumenti`:

```bash
node index.js --envName <env> --inputFile <percorso_file> --restore
```

oppure

```bash
node index.js -e <env> -f <percorso_file> -r
```

## Output

Al termine dell'esecuzione:

* In modalità verifica, viene generato un file CSV nella cartella `results/` con il dettaglio di ogni IUN, allegato, stato documento e presenza di delete marker.
* In modalità ripristino, vengono generati due file TXT nella cartella `results/`:
  * Uno con gli IUN per cui sono stati trovati e rimossi delete marker
  * Uno con gli IUN senza delete marker
