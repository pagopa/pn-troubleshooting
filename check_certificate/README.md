# Recupera la data di scadenza dei certificati

Script di recupero data di scadenza dei certificati

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Lo script esegue un operazione di get dal parameter store di aws per ricrearsi il certificato e verificando la data di scadenza dello stesso. Il nome del certificato che corrisponde essere il nome del parameter presente nel parameter store viene inserito nel file `certificate.json`.

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-core-<env>
```
Aggiungere il nome dei parameters all'interno del certificate.json

### Esecuzione
```bash
node index.js --envName <env-Name>
```
Dove:
- `<env-Name>` è l'ambiente sul quale si intende fare la verifica dei certificati
