# change_microservices_log_level

Script per aggiornare i log level di un microservizio al livello minimo 

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script per aggiornare i log level di un microservizio al livello minimo 

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
node index.js --envName <env-name> --microservices <file-name>

```
Dove:
- `<env-name>` l'environment sul quale si intende avviare lo script
- `<microservices>` lista di microservizi sul quale si intende modificare il log level (',' come separatore)
