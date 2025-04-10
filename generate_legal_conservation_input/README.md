# Generate legal conservation input

Dato un elenco di FileKeys, lo script genera un array json in cui ogni elemento ha una struttura predefinita

## Indice

* [Descrizione](#descrizione)
* [Prerequisiti](#prerequisiti)
* [Installazione](#installazione)
* [Utilizzo](#utilizzo)
* [Esempi](#esempi)

## Descrizione

Data la lista di FileKey allegata nel task "PN-14382: Gestione file corrotti conservazione", creare uno script che generi un json con un array dove ogni elemento avrà la seguente struttura:

{
    "key": "<fileKey>",
    "versionId": "01",
    "documentType": "<documentType>", // da tabella pn-SsDocumenti
    "documentStatus": "<documentLogicalState>", // da tabella pn-SsDocumenti
    "contentType": "<contentType>", // da tabella pn-SsDocumenti
    "checksum": "<checkSum>", // da tabella pn-SsDocumenti
    "retentionUntil": "<retentionUntil>", // da tabella pn-SsDocumenti 
    "client_short_code": "<clientShortCode>" // da tabella pn-SsDocumenti
}

## Prerequisiti

- Node.js >= 18.0.0
- Accesso AWS SSO configurato
- File di input contenente i FileKey

## Installazione

```bash
npm install
```

## Utilizzo

### Configurazione AWS SSO

Eseguire lo script
```bash

node node index.js --envName <environment> --inputFile <path>
```
oppure
```bash
node index.js -e <environment> -f <path>
```
Dove:
- `<env>` è l'ambiente di destinazione, deve essere uno tra: dev, uat, test, prod, hotfix
- `<path>` è il percorso al file contenente i FileKey

### Parametri

- --envName, -e:    Obbligatorio. Ambiente di destinazione (dev|uat|test|prod|hotfix)
- --inputFile, -f:  Obbligatorio. Percorso al file contenente i FileKey 
- --help, -h:       Visualizza il messaggio di aiuto

### File di Output

Lo script genera un array di json in cui ogni elemento ha una struttura predefinita nella cartella results/:

- `output_<sisdate>.json`: contiene i dati associati ad ogni FileKey estratti dalla tabella pn-SsDocumenti presente in confinfo

### Esempio

```bash
node index.js --envName dev --inputFile ./input.json`;
```