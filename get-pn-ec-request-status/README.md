# get-pn-ec-request-status

Script per reperire gli stati corrispondenti ad una lista di requestId di pn-ec.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Il package contiene uno script che, dato in input un file contenente una lista di requestId, genera in output un file .csv contenente tali requestId
e i relativi stati associati.

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
node index.js --awsProfile <aws-profile> --filePath <file-path>
```

Dove:

- `<aws-profile>` è il profilo dell'account AWS. Se non viene inserito, verranno prese di default le credenziali AWS di sistema; `OPZIONALE`
- `<file-path>` è il percorso del file contenente la lista di requestId. Il file deve contenere un requestId per riga. `OBBLIGATORIO`

Alla fine del processo, verrà generato un file _"statuses.csv"_ contenente i requestId e i relativi stati associati.

In caso di errore, verrà generato un file _"failures.csv"_ contenente i requestId che hanno generato l'errore e la causa dello stesso.
```