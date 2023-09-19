# Replace certificate

Script che effettua il backup dei certificati o li sostituisce con gli ultimi generati

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script estrae informazioni dei certificati ade e infocamere ed effettua operazioni di backup e sostituzione con i nuovi.

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
node ./index.js --envName <env-name> --certificate <ade|infocamere> [--replace]"
```
Dove:
- `<env-name>` è l'environment sul quale si intende estrarre informazioni; (obbligatorio)
- `<certificate>` il certificato di cui si vuole fare il backup e/o sostituire; (obbligatorio)
- `replace` parametro opzionale impostato a false di default che aggiungendolo effettua la sostituzione dei certificati