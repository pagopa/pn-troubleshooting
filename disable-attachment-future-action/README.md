# Disable Attachment Future Action

Script per la disabilitazione delle azioni future relative ad allegati di notifiche perfezionate o non perfezionate.

## Tabella dei Contenuti

* [Descrizione](#descrizione)
* [Installazione](#installazione)
* [Utilizzo](#utilizzo)
  * [Esecuzione](#esecuzione)
  * [Formato Output](#formato-output)

## Descrizione

Lo script esegue le seguenti operazioni:

1. Legge in input un file TXT contenente una lista di IUN (uno per riga).
2. Per ogni IUN:
   * Interroga la tabella `pn-Timelines` per verificare la presenza di almeno un evento con categoria `REFINEMENT` o `NOTIFICATION_VIEWED`.
   * Se è presente almeno un evento di queste categorie (IUN perfezionato):
     * Cerca lo IUN nell'indice `iun-index` della tabella `pn-FutureAction` e ne disabilita le azioni future che abbiano `actionId` con prefisso `check_attachment_retention_iun`, impostandone l'attributo `logicalDeleted` a `true`.
   * Se non è presente nessun evento di queste categorie (IUN non perfezionato):
     * Cerca lo IUN nell'indice `iun-index` della tabella `pn-FutureAction`, ne recupera `timeslot` e `actionId` dopodiché li usa come chiavi di partizione e ordinamento per interrogare la tabella `pn-FutureAction` e disabilitare le azioni future restituite che abbiano `type` esattamente uguale a `CHECK_ATTACHMENT_RETENTION`, impostandone l'attributo `logicalDeleted` a `true`.
   * Se lo IUN non è presente nell'indice `iun-index` della tabella `pn-FutureAction`, viene ignorato.

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

Al termine dell'esecuzione vengono prodotti quattro file di testo, in base al perfezionamento dello IUN e alla disabilitazione delle azioni future:

* `results/refined_iuns_disabled_<timestamp>.txt`
* `results/unrefined_iuns_not_disabled_<timestamp>.txt`
* `results/refined_iuns_disabled_<timestamp>.txt`
* `results/unrefined_iuns_not_disabled<timestamp>.txt`
