# Script di sessione SSM da Bastion Core ad ALB Confinfo

Script Bash per apertura automatica di sessione SSM con PortForwarding verso ALB interno di Confinfo.  
Lo script esegue le seguenti operazioni:

1. Interroga EC2 in ambiente Core per individuarne la Bastion.
2. Se lanciato con `--start`, apre una sessione SSM con i seguenti parametri:
    - Target: ID della EC2 precedentemente individuata
    - Document Name: `AWS-StartPortForwardingSessionToRemoteHost`
    - Port: variabile d'ambiente `$SSM_FORWARD_PORT`, se definita (predefinita `8080`)
    - Local Port: variabile d'ambiente `$SSM_LOCAL_PORT`, se definita (predefinita `8888`)
    - Host: variabile d'ambiente `$CONFINFO_ALB_ENDPOINT`, se definita (predefinita `alb.confidential.pn.internal`)
    Le variabili d'ambiente vengono lette da un eventuale file locale `.env` nella stessa cartella dello script.
    Il PID del processo viene salvato sotto `output/ssm_bastion_to_confinfo`
3. Se lanciato con `--stop`, legge il PID del processo sotto `output/ssm_bastion_to_confinfo` e lo termina, dopodiché verifica se c'è ancora un processo in ascolto sulla `$SSM_LOCAL_PORT` e termina anche quello.

## Prerequisiti

- AWS CLI v2
- Plugin SSM
- Configurazione SSO

## Utilizzo

### Autenticazione AWS

Accedi ad AWS tramite SSO, ad esempio:

```bash
aws sso login --profile sso_pn-confinfo-prod
```

### Esecuzione Script

```bash
./ssm_bastion_to_confinfo.sh --env <env-name> [--start, --stop]
```

Dove:

- `--env`: (Obbligatorio) Ambiente destinazione dove aprire la sessione SSM.
- `--start`, `--stop`: (Obbligatorio) Comando di avvio o arresto della sessione SSM.
