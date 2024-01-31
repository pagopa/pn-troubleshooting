# Increase doc retention

Script che, dato in input un json con la lista di IUN, la data di notifica e la lista di attachments:
- verifica se vi sono documenti eliminati su s3 o per i quali è necessario allungare rimuovere il "deletion marker"
- inserisce le azioni in pn-Action e pn-FutureAction affinché Delivery Push verifichi e allunghi la retention dei suddetti file

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script recupera, per ogni attachment, tramite una HeadObject sul bucket S3 fornito in input (il bucket di SafeStorage), verifica se il file sia ancora presente su s3. Nel caso in cui il documento sia eliminato, lo script:
- eliminare il deletion marker su S3
- aggiornare la tabella pn-SsDocumenti impostando la property documentState al valore "attached"

Se il parametro scheduleAction è impostato, vengono anche creati i record in pn-Action e pn-FutureAction per l'azione CHECK_ATTACHMENT_RETENTION. Questo lascerà a Delivery Push l'onere di verificare la retention degli allegati e l'eventuale allungamento, oltre che la rischedulazione delle azioni.

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-core-<env>
```

### Esecuzione
```bash  
node index.js --envName <envName> --directory <directory> [--delayOffset <delayOffset>] [--scheduleAction]
```
Dove:
- `<envName>` è l'environment si intende eseguire la procedura;
- `<directory>` è la directory all'interno della quale inserire i file json;
- `<delayOffset>` numero di minuti a partire dai quali programmare la action di Delivery Push
- `<scheduleAction>` se impostato, verranno inserite le action in pn-FutureAction e pn-Action
