# Delete Attachment Future Action Script

Script Bash per la gestione e pulizia delle future action relative agli allegati.

## Tabella dei Contenuti

* [Descrizione](#descrizione)
* [Prerequisiti](#prerequisiti)
* [Utilizzo](#utilizzo)
    * [Autenticazione AWS](#autenticazione-aws)
    * [Esecuzione Script](#esecuzione-script)
    * [Esempio](#esempio)
* [Struttura Output](#struttura-output)
    * [File di Output](#file-di-output)
    * [Modalità Purge](#modalità-purge)

## Descrizione

Lo script esegue le seguenti operazioni:

1. Legge in input il dump dei messaggi dalla coda DLQ `pn-delivery_push_actions-DLQ` come prelevati dallo script [dump_sqs](https://github.com/pagopa/pn-troubleshooting/tree/main/dump_sqs)
2. Filtra i messaggi di tipo `CHECK_ATTACHMENT_RETENTION` dal dump della DLQ
3. Processa i messaggi filtrati tramite lo script [delete-attachment-future-action](https://github.com/pagopa/pn-troubleshooting/tree/main/delete-attachment-future-action)
4. Opzionalmente, rimuove dalla DLQ i messaggi elaborati usando lo script [remove_from_sqs](https://github.com/pagopa/pn-troubleshooting/tree/main/remove_from_sqs) 

## Prerequisiti

- jq
- Node.js >= v16.0.0
- AWS CLI configurato con SSO

## Utilizzo

### Autenticazione AWS

```bash
aws sso login --profile sso_pn-core-<env>
```
### Esecuzione Script

```bash
./delete_attachment_future_action.sh --envName <env> --dumpFile <path> [--purge]
 ```
Dove:

- `--envName, -e`: (Obbligatorio) Ambiente di destinazione (dev|test|uat|hotfix|prod)
- `--dumpFile, -f`: (Obbligatorio) Percorso del file dump SQS
- `--purge, -p`: (Opzionale) Rimuove i messaggi elaborati dalla DLQ
- `--help, -h`: Mostra il messaggio di aiuto

### Esempio

```bash
./delete_attachment_future_action.sh -e dev -f dump.json --purge
```

## Struttura Output

Lo script crea la seguente struttura:

```
automation_scripts/
├── delete_attachment_future_action.sh
└── delete_attachment_future_action/
    ├── temp/
    │   └── check_attachment_retention.json
    └── result/
        └── to-remove.json
```

### File di Output

- `check_attachment_retention.json`: Messaggi filtrati di tipo CHECK_ATTACHMENT_RETENTION
- `to-remove.json`: MD5 dei messaggi elaborati, pronti per la rimozione dalla DLQ

### Modalità Purge

Se attivato con `--purge`, lo script:

- Elabora i messaggi filtrati
- Verifica la presenza del file risultato
- Rimuove dalla DLQ i messaggi corrispondenti usando remove_from_sqs