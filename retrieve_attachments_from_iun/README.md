# Retrieve Attachments from iun

Script che recupera gli attachments correlati ad uno iun

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script recupera da pn-Notification gli attachments di una serie di iun.

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
KHQN-PPPP-NQHJ-202309-G-1
ZWGQ-ZZZZ-EKAT-202307-Z-1
KKKK-PPPP-NQHJ-202309-G-1
ZQQQ-ZZZZ-EKAT-202307-Z-1