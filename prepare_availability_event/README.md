# Creare eventi di disponibilità

Lo script permette di creare un evento di disponibilità

## Indice

* [Descrizione](#descrizione)
* [Prerequisiti](#prerequisiti)
* [Installazione](#installazione)
* [Utilizzo](#utilizzo)
* [Esempi](#esempi)

## Descrizione

Lo script permette di creare un evento di disponibilità

## Prerequisiti

- Node.js >= 18.0.0
- Accesso AWS SSO configurato

## Installazione

```bash
npm install
```

## Utilizzo

### Configurazione AWS SSO

Eseguire lo script
```bash
node index.js --timestamp <timestamp> --accountId <account-id> --fileName <file-name>
```

Dove:
- `<timestamp>` è il timestamp dove viene recuperato l'evento. (format: 2025-07-26T08:55:20.904Z)
- `<account-id>` è l'id dell'account sul quale si effettua la procedura
- `<file-name>` è il file dove sono contenute le fileKey. (format: <filekey>,<size>)
