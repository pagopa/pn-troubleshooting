# Retool dashboards

Gli script contenuti in questa directory permettono di eseguire un deployment di Retool in locale. Vengono generate le credenziali temporanee AWS (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` e `AWS_SESSION_TOKEN`) mediante l'utilizzo di AWS CLI, le quali sono successivamente iniettate nel container per autenticare le chiamate alle lambda.

## Prerequisiti

* Docker
* AWS CLI >= 2.13.38

## Quick start
Deployment Retool con restore database (sostituire `<SSO_PROFILE>` con l'account SSO desiderato es. `sso_pn-core-dev`).
```sh
./docker_up_profile.sh <SSO_PROFILE> --restore_db 
```
Il backup `./pg_backups/backup.sql` contiene gli utenti e le risorse preconfigurate.

Nel caso in cui il token di sessione AWS scada, è possibile rinnovarlo eseguendo nuovamente lo script senza l'opzione `--restore_db`. 

```sh
./docker_up_profile.sh <SSO_PROFILE> 
```

Il servizio è disponibile su [localhost:3000](http://localhost:3000). 

Utilizzare le seguenti credenziali: email send@pagopa.it e password send1234.

Una volta autenticati, posizionarsi sul tab "Apps" e creare la dashboard da file JSON selezionando i file in `./dashboards`.

## Scripts
### `docker_up_profile.sh`
Avvia il deployment di Retool con la possibilità di ripristinare il database da `./pg_backups/backup.sql`. Sostituire `<SSO_PROFILE>` con l'account SSO desiderato (ad esempio, sso_pn-core-dev).

Usage: `./docker_up_profile.sh <SSO_PROFILE> [--restore_db]`


### `docker_setup.sh`
Crea il file docker.env dal template e aggiunge la licenza di retool. Per generarne una andare su https://my.retool.com.

### `backup_db.sh`
Esegue il backup del database postgres su `./pg_backups/backup.sql`. 

### `restore_db.sh`
Esegue il restore del database dal backup `./pg_backups/backup.sql`.
Nota bene: tutti i container devono essere down ad eccezione di postgres.

### `update.sh`
Scarica eventuali aggiornamenti disponibili delle immagini docker.


