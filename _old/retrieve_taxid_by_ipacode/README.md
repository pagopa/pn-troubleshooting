# Retrieve_taxId_by_IpaCode

Script che preso in input un file che contiene il dump della tabella pn-OnboardingInstitutions e un file che contiene una lista di IpaCode restituisce i taxCode corrispondenti nel formato di whitelisting richiesto

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Il package contiene due script:
- script che preso in input un file che contiene il dump della tabella pn-OnboardingInstitutions e un file che contiene una lista di IpaCode restituisce i taxCode corrispondenti nel formato di whitelisting richiesto
- script che, preso in input un file con la lista dei codici IPA da inserire in whitelist e un file con il mapping con i Codifici Fiscali di tutti i codici IPA noti, genera un json da inserire nel parametro MapPaSendMoreThan20Grams

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-core-<env>
```

### Sync da DB
```bash  
node index.js --fileNameIpa <fileNameIpa> --fileNameDump <fileNameDump>
```
Dove:
- `<fileNameIpa>` è il file che contiene la lista degli IpaCode;
- `<fileNameDump>` è il file che contiene il dump della tabella pn-OnboardingInstitutions;

il file fileNameIpa deve essere nel seguente formato:
<IpaCode0>
<IpaCode1>
<IpaCode2>

### Sync da file mapping locale
```bash  
node index-local.js --fileNameIpa <fileNameIpa> --mappingIpa <mappingIpa>
```
Dove:
- `<fileNameIpa>` è il file che contiene la lista degli IpaCode;
- `<mappingIpa>` è il file che contiene il mapping codice fiscale / codice IPA;

Il file fileNameIpa deve essere in formato CSV e il codice IPA è previsto nella seconda colonna (la prima riga contiene gli header e non viene considerata)
Il file mappingIpa deve essere in formato CSV e le prime due colonne sono "Codice IPA" e "Codice Fiscale"  (la prima riga contiene gli header e non viene considerata). Il file aggiornato è disponibile in: `files/enti.csv`
