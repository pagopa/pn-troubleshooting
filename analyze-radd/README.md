# Analyze Radd

Script per verificare gli inserimenti in RaddRegistry per la RADD.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script, dato in input un csv contentente REQUEST_ID e CX_ID come intestazione, verifica gli inserimenti in RaddRegistry

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
node index.js --envName <env-name> --fileName <file-name>

```
Dove:
- `<env-name>` l'environment sul quale si intende avviare lo script
- `<file-name>` csv contenente requestId e cxId
