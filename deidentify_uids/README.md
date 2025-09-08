# deidentify uids

script che per ogni uuid recupera taxId e CF da data-vault e selfcare.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

script che recupera taxId e CF da data-vault e selfcare.

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
node index.js --dirPath <dir_path>

```
Dove:
- `<dir_path>` path dove sono presenti i file degli uuid.