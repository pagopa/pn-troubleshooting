# Script di sessione SSM verso Apache Spark

Script Bash per apertura automatica di due sessioni SSM con PortForwarding verso una EC2 Apache Spark.  
Lo script esegue le seguenti operazioni:

1. Interroga EC2 in ambiente Core per individuarne l'istanza con tag `usage=spark`.
2. Se lanciato con `--start`, apre **due** sessioni SSM con i seguenti parametri:
    - Target: ID della EC2 precedentemente individuata
    - Document Name: `AWS-StartPortForwardingSession`
    - Porta 1: variabile d'ambiente `$SSM_PORT1`, se definita (predefinita `4040`)
    - Porta 2: variabile d'ambiente `$SSM_PORT2`, se definita (predefinita `10100`)
    - Local Port 1: variabile d'ambiente `$SSM_LOCAL_PORT1`, se definita (predefinita `4040`)
    - Local Port 2: variabile d'ambiente `$SSM_LOCAL_PORT2`, se definita (predefinita `10100`)
    Le variabili d'ambiente vengono lette da un eventuale file locale `.env` nella stessa cartella dello script.
    I PID dei processi vengono salvati sotto `output/ssm_apache_spark`
3. Se lanciato con `--stop`, legge i PID dei processi sotto `output/ssm_apache_spark` e li termina, dopodiché verifica se ci sono ancora processi in ascolto sulle porte locali e termina anche quelli.

## Prerequisiti

- AWS CLI v2
- Plugin SSM
- Configurazione SSO

## Utilizzo

### Autenticazione AWS

Accedi ad AWS tramite SSO, ad esempio:

```bash
aws sso login --profile sso_pn-core-prod
```

### Esecuzione Script

```bash
./ssm_apache_spark.sh --env <env-name> [--start, --stop]
```

Dove:

- `--env`: (Obbligatorio) Ambiente destinazione dove aprire la sessione SSM.
- `--start`, `--stop`: (Obbligatorio) Comando di avvio o arresto delle sessioni SSM.
