# Retrieve_taxId_by_IpaCode

Script che preso in input un file che contiene il dump della tabella pn-OnboardingInstitutions e un file che contiene una lista di IpaCode restituisce i taxCode corrispondenti nel formato di whitelisting richiesto

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script che preso in input un file che contiene il dump della tabella pn-OnboardingInstitutions e un file che contiene una lista di IpaCode restituisce i taxCode corrispondenti nel formato di whitelisting richiesto

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
node index.js --fileNameIpa <fileNameIpa> --fileNameDump <fileNameDump>
```
Dove:
- `<fileNameIpa>` è il file che contiene la lista degli IpaCode;
- `<fileNameDump>` è il file che contiene il dump della tabella pn-OnboardingInstitutions;

il file fileNameIpa deve essere nel seguente formato:
<IpaCode0>
<IpaCode1>
<IpaCode2>