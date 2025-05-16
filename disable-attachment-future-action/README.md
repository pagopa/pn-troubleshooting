# Disable Attachment Future Action

Script per la disabilitazione delle azioni future relative ad allegati di notifiche perfezionate o non perfezionate.

## Tabella dei Contenuti

* [Descrizione](#descrizione)
* [Installazione](#installazione)
* [Utilizzo](#utilizzo)
  * [Esecuzione](#esecuzione)
  * [Formato Output](#formato-output)
  * [Statistiche di Esecuzione](#statistiche-di-esecuzione)

## Descrizione

Lo script esegue le seguenti operazioni:

1. Legge in input un file TXT contenente una lista di IUN (uno per riga).
2. Per ogni IUN:
   * Interroga la tabella `pn-Timelines` per verificare la presenza di almeno un evento con categoria `REFINEMENT` o `NOTIFICATION_VIEWED`.
   * Se presente almeno un evento di queste categorie (IUN perfezionato):
     * Aggiorna nella tabella `pn-FutureAction` tutte le azioni future con `actionId` che inizia per `check_attachment_retention_iun` impostando l'attributo `logicalDeleted` a `true`.
   * Se non è presente nessun evento di queste categorie (IUN non perfezionatos):
     * Aggiorna nella tabella `pn-FutureAction` tutte le azioni future con `type` esattamente uguale a `CHECK_ATTACHMENT_RETENTION` impostando l'attributo `logicalDeleted` a `true`.

## Installazione

```bash
npm install
```

## Utilizzo

### Esecuzione

```bash
node index.js --envName <env> --inputFile <path>
```

oppure

```bash
node index.js -e <env> -f <path>
```

Dove:

* `<env>` è l'ambiente di destinazione, deve essere uno tra: dev, uat, test, prod, hotfix
* `<inputFile>` è il percorso al file TXT contenente gli IUN da processare (uno per riga)

### Formato Output

Al termine dell'esecuzione, vengono prodotti due file di testo:

* `results/refined_iuns_<timestamp>.txt`: contiene gli IUN di notifiche perfezionate per cui sono state disabilitate azioni future (presente almeno un evento di tipo `REFINEMENT` o `NOTIFICATION_VIEWED`).
* `results/unrefined_iuns_<timestamp>.txt`: contiene gli IUN di notifiche non perfezionate per cui sono state disabilitate azioni future (nessun evento di tipo `REFINEMENT` o `NOTIFICATION_VIEWED`).
