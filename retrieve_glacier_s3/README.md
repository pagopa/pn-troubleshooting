# Retrieve Glacier Documents

Script che preso in input un file effettua una richiesta di retrieve da glacier per i documenti contenuti nel file

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script esegue una richiesta di recupero dei documenti su glacier.

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
node index.js --envName <envName> --bucketName <bucketName> --fileName <fileName> --expiration <expiration> --tier <tier>
```
Dove:
- `<envName>` è l'environment si intende eseguire la procedura;
- `<bucketName>` è il nome del bucket in cui si trovano i documenti;
- `<fileName>` è il file-path del file che riporta gli IUN e i documenti associati;
- `<expiration>` numeri di giorni per il quale vuoi rendere il documento disponibile; [default 30]
- `<tier>` la velocità con il quale si vuole recuperare i documenti [Bulk|Standard|Expedited]; [default Bulk]

il file deve essere nel seguente formato
<IUN-0>,<FileName-0>
<IUN-1>,<FileName-1>
<IUN-2>,<FileName-2>