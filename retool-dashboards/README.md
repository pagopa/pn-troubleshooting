# Retool dashboards

Gli script contenuti in questa directory permettono di eseguire un deployment di Retool in locale. Vengono generate le credenziali temporanee AWS (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` e `AWS_SESSION_TOKEN`) mediante l'utilizzo di AWS CLI, le quali sono successivamente iniettate nel container per autenticare le chiamate alle lambda.

## Prerequisiti

* Docker
* AWS CLI

## Quick start
Deployment Retool con restore database (sostituire `<SSO_PROFILE>` con l'account SSO desiderato es. `sso_pn-core-dev`).
```sh
./docker_up_profile.sh <SSO_PROFILE> --restore_db 
```
Il backup `./pg_backups/backup.sql` contiene gli utenti e le dashboard salvate.

Nel caso in cui il token di sessione AWS scada, è possibile rinnovarlo eseguendo nuovamente lo script senza l'opzione `--restore_db`. 

```sh
./docker_up_profile.sh <SSO_PROFILE> 
```

Il servizio è disponibile su [localhost:3000](http://localhost:3000). 
Utilizzare le seguenti credenziali: email send@pagopa.it e password send1234.

## Scripts
### `docker_up_profile.sh`
Questo script è utilizzato per avviare il deployment di Retool con la possibilità di ripristinare il database. Sostituisci <aws-profile> con l'account SSO desiderato (ad esempio, sso_pn-core-dev). L'opzione --restore_db è facoltativa e consente di eseguire il ripristino del database.

Usage: `./docker_up_profile.sh <aws-profile> [--restore_db]`


### `docker_setup.sh`
Crea il file docker.env dal template e aggiunge la licenza di retool. Per generarne una andare su https://my.retool.com.

### `backup_db.sh`
Esegue il backup del database postgres su `./pg_backups/backup.sql`. 

### `restore_db.sh`
Esegue il restore del database dal backup `./pg_backups/backup.sql`.
Nota bene: tutti i container devono essere down ad eccezione di postgres.

### `update.sh`
Scarica eventuali aggiornamenti disponibili delle immagini docker.


