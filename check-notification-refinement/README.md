# Check Notification Refinement

Script per la verifica dello stato di perfezionamento delle notifiche tramite IUN.

## Tabella dei Contenuti

* [Descrizione](#descrizione)
* [Installazione](#installazione)
* [Utilizzo](#utilizzo)
  * [Preparazione](#preparazione)
  * [Esecuzione](#esecuzione)

## Descrizione

Lo script esegue la verifica di una lista di IUN per determinare se la relativa notifica è stata perfezionata, secondo le seguenti regole:

1. Legge da un file di input la lista degli IUN da verificare (uno per riga).
2. Per ogni IUN:
   * Interroga la tabella `pn-Timelines` usando lo IUN come chiave di partizione.
   * Analizza gli eventi restituiti e cerca la presenza di eventi con `category` uguale a `NOTIFICATION_VIEWED` o `REFINEMENT`.
     * Se nessuno dei due è presente, la notifica è classificata come **Non perfezionata**.
     * Se è presente solo uno dei due, la notifica è classificata come **Perfezionata**.
     * Se sono presenti entrambi, viene considerato solo quello con timestamp più vecchio e la notifica è classificata come **Perfezionata**.
   * Se la notifica è perfezionata, esamina la data dell'evento di perfezionamento:
     * Se sono passati **120 giorni o più** dal timestamp, la notifica è classificata come **Perfezionata da più di 120 giorni**.
     * Se sono passati **meno di 120 giorni**, la notifica è classificata come **Perfezionata da meno di 120 giorni**.
   * Se si verifica un errore durante la query DynamoDB, lo IUN viene classificato come **Errore**.
3. Al termine, stampa un report riepilogativo con il totale degli IUN processati e la suddivisione per categoria.
4. Scrive quattro file di output nella cartella `results/`, ciascuno contenente la lista degli IUN per categoria:
   * Non perfezionata
   * Perfezionata da più di 120 giorni
   * Perfezionata da meno di 120 giorni (con scadenza dei 120 giorni esatti dal perfezionamento)
   * Errore
   I file sono nominati con un timestamp dell'esecuzione.

## Installazione

```bash
npm install
```

## Utilizzo

### Preparazione

Effettuare il login AWS per il profilo desiderato:

```bash
aws sso login --profile sso_pn-core-<env>
```

### Esecuzione

```bash
node index.js --envName <env> --inputFile <path>
```

oppure

```bash
node index.js -e <env> -i <path>
```

Dove:

* `<env>` è l'ambiente di destinazione, deve essere uno tra: dev, uat, test, prod, hotfix
* `<path>` è il percorso al file di testo contenente gli IUN da analizzare (uno per riga)

Esempio:

```bash
node index.js -e dev -i ./IUNs.txt
```

Al termine dell'esecuzione, i risultati saranno disponibili nella cartella `results/` con i seguenti file:

* `unrefined_<timestamp>.txt`
* `refined_120plus_<timestamp>.txt`
* `refined_120minus_<timestamp>.csv`
* `error_<timestamp>.txt`
