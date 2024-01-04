# Increase doc retention

Script che, dato in input un csv con la lista di IUN non perfezionati e la data di notifica:
- verifica se vi sono documenti da ripristinare su s3 o per i quali è necessario allungare la retention
- esegue l'operazione di ripristino o allungamento retention

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script recupera, per ogni IUN, la lista di attachments e, per ognuno di essi, tramite una HeadObject sul bucket S3 fornito in input (il bucket di SafeStorage), verifica se il file sia ancora presente su s3.

L'output dello script sono due file:
- "notFound.json" che conterrà al lista di documenti non più disponibili su S3.
- "s3.json" che conterrà la lista di documenti ancora disponibili su s3, indicando ancora l'expiration come riportata dalla chiamata ad S3

Lo script, per i doc presenti in notFound.json, dovrà:
- eliminare il deletion marker su S3
- aggiornare la tabella pn-SsDocumenti impostando la property documentState al valore "attached"

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
node index.js --envName <envName> --bucketName <bucketName> --fileName <fileName> --expiration <expiration>
```
Dove:
- `<envName>` è l'environment si intende eseguire la procedura;
- `<bucketName>` è il nome del bucket in cui si trovano i documenti;
- `<fileName>` è il file-path del file che riporta gli IUN e i documenti associati;
- `<expiration>` numeri di giorni per il quale si vuole allungare la retention (solo per i doc ancora su S3)