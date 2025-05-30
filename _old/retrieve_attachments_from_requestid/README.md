# Retrieve Attachments from requestId

Script che recupera gli attachments correlati ad un requestId

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script recupera da pn-EcRichieste i documenti allegati.

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-confinfo-<env>
```

### Esecuzione
```bash  
node index.js --envName <envName> --fileName <fileName> 
```
Dove:
- `<envName>` è l'environment si intende eseguire la procedura;
- `<fileName>` è il file-path del file che riporta la lista degli iun;

il file deve essere fornito nel seguente formato
PREPARE_ANALOG_DOMICILE.IUN_AAAA-BBBB-CCCC-202307-M-1.RECINDEX_0.ATTEMPT_1.PCRETRY_0
PREPARE_ANALOG_DOMICILE.IUN_AAAA-BBBB-CCCC-202307-M-1.RECINDEX_0.ATTEMPT_1.PCRETRY_0