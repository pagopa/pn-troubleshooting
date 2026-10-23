# Inventario KMS

Lo script [manage_kms_keys.py](./manage_kms_keys.py) individua e dismette le
chiavi KMS inutilizzate nella regione `eu-south-1`: verifica le associazioni reali
chiave-risorsa su 30 servizi AWS e gestisce disabilitazione ed eliminazione.
Richiede Python 3.10+ e AWS CLI v2 con un profilo configurato; nessuna dipendenza
Python esterna.

## manage_kms_keys.py

| `--mode` | Input | Effetto |
| --- | --- | --- |
| `report` (default) | CSV chiavi (`id,alias,tags,creation_date,last_usage_date`) | Report delle associazioni. Sola lettura. |
| `disableKMS` | Report + `--microservice` | Disabilita le chiavi inutilizzate del microservizio. |
| `enableKMS` | Esiti di `disableKMS` | Rollback: riabilita le chiavi `DISABLED`. |
| `deleteKMS` | Esiti di `disableKMS` | Verifica che le chiavi siano `Disabled` e ne programma l'eliminazione. |
| `cancelDeleteKMS` | Esiti di `deleteKMS` | Rollback: annulla l'eliminazione programmata. |

Flusso previsto:

```bash
P="--profile NOME_PROFILO"
# 1. report completo (sola lettura, ~10 minuti)
python3 manage_kms_keys.py --input core-dev-cmk-aggiornato.csv --output pn-kms-associations.csv $P
# 2. disabilitazione: prima dry-run, poi --apply
python3 manage_kms_keys.py --mode disableKMS --input pn-kms-associations.csv --microservice pn-delayer $P [--apply]
# 3. osservazione (es. DisabledException in CloudTrail); se necessario rollback
python3 manage_kms_keys.py --mode enableKMS --input kms_disable_pn-delayer_<ts>.csv $P [--apply]
# 4. eliminazione programmata (attesa AWS 30 giorni, --pending-days 7-30)
python3 manage_kms_keys.py --mode deleteKMS --input kms_disable_pn-delayer_<ts>.csv $P [--apply]
# 5. rollback durante l'attesa: la chiave torna Disabled
python3 manage_kms_keys.py --mode cancelDeleteKMS --input kms_delete_<nome>_<ts>.csv $P [--apply]
```

`--microservice noTag` seleziona le chiavi senza tag `Microservice`. In `report`
`--microservice` e' opzionale e filtra solo le chiavi, non le risorse analizzate.

### report

Per ogni servizio enumera tutte le risorse della regione (senza filtri sul nome)
e confronta l'ARN esatto della chiave configurata; gli alias sono risolti con
`kms list-aliases`. Account e partizione derivano da `sts get-caller-identity`.

Servizi verificati: CloudWatch Logs, Kinesis, Firehose, S3 (cifratura predefinita
del bucket), DynamoDB, SQS, SNS, RDS/Aurora (istanze, cluster, snapshot),
Secrets Manager, ElastiCache (serverless, replication group, snapshot),
OpenSearch, EFS, AWS Backup (vault e recovery point), Athena, Lambda (tutte le
versioni), CodeBuild, EventBridge, CloudTrail, EC2/EBS (chiave di default, volumi,
snapshot, AMI, launch template), SES, SSM Parameter Store, ECR, Step Functions,
CodePipeline, ECS, Cognito, Glue, X-Ray, QuickSight.

Esclusi perche' non usano una CMK in regione o scrivono su risorse gia' coperte:
API Gateway, CloudFront, WAF, ELB, VPC, Route 53, Glacier, ACM, Amplify,
CloudShell, CloudFormation, Location Service, Access Analyzer, Cost Explorer,
Service Catalog.

Output (UTF-8 con BOM, sovrascritti se esistenti):

- `--output`: una riga per associazione (o per chiave senza match), con le
  colonne originali piu' `Microservice, KeyArn, Status, ResourceType,
  ResourceName, ResourceArn, Property, KeyReference` e lo scope della scansione;
- `<output>_summary.csv`: conteggi per microservizio.

| Status | Significato |
| --- | --- |
| `ASSOCIATED` | Almeno una risorsa configura la chiave |
| `NO_ASSOCIATION_FOUND` | Nessun match, scansione completa |
| `SCAN_INCOMPLETE` | Nessun match, ma ci sono stati errori: nessuna conclusione possibile |

Un qualsiasi errore di lettura imposta `ScanComplete=false` su tutte le righe.

Limiti: il report descrive la configurazione corrente, non prova che una chiave
sia eliminabile. Non copre dati storici cifrati con chiavi precedenti (log, oggetti
o versioni S3, versioni dei segreti, backup nativi DynamoDB), risorse condivise da
altri account ne' l'uso diretto delle chiavi dalle applicazioni (es. firma JWT).
`last_usage_date` e' copiata dal CSV di input.

### disableKMS / enableKMS

`disableKMS` usa solo il report (nessuna nuova scansione). Il report deve avere
`ScanComplete=true` ed essere dello stesso account del profilo; va rigenerato se
nel frattempo sono cambiate le risorse.

| Condizione nel report | Esito |
| --- | --- |
| Associata ad almeno una risorsa | `SKIPPED` |
| `last_usage_date` valorizzata | `ATTENTION` (non disabilitata) |
| `creation_date` assente, non valida o piu' recente di `--min-age-days` (default 30) | `ATTENTION` (non disabilitata) |
| Altrimenti | `DISABLE_CANDIDATE`, `DISABLED` dopo `--apply` |

`enableKMS` riabilita le righe `DISABLED` (`ENABLE_CANDIDATE` -> `ENABLED`).

### deleteKMS / cancelDeleteKMS

`deleteKMS` considera le righe `DISABLED` e per ciascuna esegue
`aws kms describe-key`: procede solo se `KeyState=Disabled` e
`KeyManager=CUSTOMER`, altrimenti `SKIPPED`. Con `--apply` il controllo e'
ripetuto subito prima di `schedule-key-deletion`.

| Esito | Significato |
| --- | --- |
| `DELETE_CANDIDATE` | Chiave `Disabled`, eliminabile (dry-run) |
| `DELETION_SCHEDULED` | Eliminazione programmata; data nel campo `Reason` |
| `SKIPPED` | Chiave non `Disabled` (es. riabilitata) o non gestita dal cliente |

La chiave resta `PendingDeletion` per `--pending-days` giorni; fino ad allora
`cancelDeleteKMS` la riporta a `Disabled` (`CANCEL_CANDIDATE` -> `DELETION_CANCELLED`).
**Trascorsa l'attesa l'eliminazione e' irreversibile** e i dati cifrati non sono
piu' decifrabili.

### Esiti, sicurezza e permessi

- Ogni modalita' di modifica scrive un CSV esiti
  (`kms_<azione>_<nome>_<timestamp>.csv`, mai sovrascritto, scritto anche in caso
  di errore) con colonne `Mode, Microservice, KeyId, KeyArn, Alias, Outcome,
  Reason, creation_date, last_usage_date, Applied, CheckedAt, AccountId, Region`.
- Senza `--apply` e' sempre un dry-run. Con `--apply` va digitato il nome del
  microservizio per confermare.
- Il client AWS ammette solo una whitelist di operazioni di lettura; ogni modalita'
  aggiunge solo quanto le serve: `describe-key` in `deleteKMS`, e con `--apply`
  la sola scrittura della modalita' (`DisableKey`, `EnableKey`,
  `ScheduleKeyDeletion` o `CancelKeyDeletion`).
- Un errore su una chiave la marca `ERROR` e lo script prosegue con le altre.

Permessi IAM: lettura dei servizi elencati (`List*`/`Describe*`/`Get*`),
`kms:ListAliases`, `sts:GetCallerIdentity`; `kms:DescribeKey` per `deleteKMS`;
la relativa scrittura KMS per `--apply`.

Codici di uscita:

| Codice | `report` | Altre modalita' |
| --- | --- | --- |
| `0` | Scansione completa | Completato |
| `1` | Errore fatale | Errore fatale o conferma rifiutata |
| `2` | Scansione incompleta (o argomenti non validi) | Almeno una chiave `ERROR` (o argomenti non validi) |
| `130` | Interrotto | Interrotto |

`--log-level DEBUG` mostra ogni chiamata AWS con la durata; `--timeout`
(default 120 s) vale per singola chiamata CLI.

## Test

Senza accesso ad AWS, dalla directory `kms_inventory`:

```bash
python3 -m unittest test_verify_kms_associations test_verify_kms_services \
  test_verify_kms_additional_services test_verify_kms_ec2_ses test_verify_kms_platform_services \
  test_verify_kms_disable
```
