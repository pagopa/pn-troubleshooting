# DNSSEC audit - PN-15539

Verifica **di sola lettura** della configurazione DNSSEC negli account AWS
indicati. Non abilita signing/validation, non modifica DNS, chiavi o policy e non
esegue login AWS.

## Requisiti

- Python >= 3.10, senza pacchetti Python aggiuntivi.
- AWS CLI v2 e profili gia autenticati.
- `dig` per NS e DS; `delv` per la validazione crittografica della catena di
  fiducia. Se mancanti, i controlli corrispondenti risultano `WARN`, non `OK`.
  Sono forniti dai pacchetti BIND/DNS utilities del sistema operativo.
- Accesso agli endpoint AWS e al resolver DNS scelto.

## Utilizzo

Dalla radice del repository:

```bash
python3 dnssec-audit/dnssec_audit.py \
  --profiles <profilo-core> <profilo-spid> <profilo-backoffice> \
  --regions eu-south-1 eu-central-1
```

Includere soltanto profili e regioni autorizzati e realmente nel perimetro.
Ogni profilo viene verificato con STS prima della scansione. Tutte le hosted
zone dell'account sono inventariate una sola volta, indipendentemente dalle
regioni; le VPC sono inventariate **solo nelle regioni indicate**.
AWS CLI gestisce la paginazione senza limiti di elementi.

Opzioni:

| Opzione | Descrizione |
|---|---|
| `--profiles ...` | Uno o piu profili AWS CLI, obbligatori. |
| `--regions ...` | Una o piu regioni VPC, obbligatorie. |
| `--dns-server <IP>` | Resolver per le verifiche DNS locali. Default: resolver di sistema, senza imporre resolver pubblici di terzi. |
| `--timeout <secondi>` | Timeout positivo per ciascun comando, default 90. |
| `--output <percorso.json>` | Nuovo report JSON; un file esistente non viene sovrascritto. |

Il report viene sempre salvato; il percorso predefinito e
`dnssec-audit/output/dnssec-audit-<timestamp-UTC>.json`, escluso da Git.
Il riepilogo leggibile viene stampato a terminale. Anche una scansione con
permessi mancanti produce il report con gli errori raccolti e prosegue, quando
possibile, sugli altri account e sulle altre risorse. Errori di argomenti o
prerequisiti interrompono invece l'avvio; un errore di scrittura del report
viene segnalato a terminale.

Il JSON include perimetro, account verificati, conteggi per stato, exit code,
limitazioni e risultati con `profile`, `account`, `region`, `resource`, `check`,
`status`, `detail`. Puo contenere nomi DNS e identificativi AWS: trattarlo come
evidenza interna e non committarlo.

## Controlli

### Zone pubbliche

- Signing Route 53 in stato `SIGNING`.
- Almeno una KSK `ACTIVE`; errori delle altre KSK sono segnalati. Una KSK
  `INACTIVE` e normale durante gestione/rotazione e viene esclusa dai controlli
  KMS e dal confronto dei DS attivi.
- Per ogni KSK attiva: chiave KMS customer-managed, `Enabled`, `ECC_NIST_P256`,
  `SIGN_VERIFY`, regione `us-east-1`.
- NS pubblici confrontati con quelli assegnati alla hosted zone. Differenze
  producono `WARN`: verificare zone duplicate/non delegate o vanity nameserver.
- DS pubblicato dal parent confrontato con i DS delle KSK attive. Basta una
  corrispondenza, per supportare il rollover con piu chiavi/DS.
- Catena verificata con `delv` sul record SOA dell'apice della zona: solo
  `fully validated` con il SOA corretto produce `OK`. Una risposta unsigned
  produce `FAIL`; errori di rete/validazione o output non riconosciuto producono
  `ERROR`, senza attribuirli automaticamente a una configurazione AWS errata.

Le private hosted zone vengono inventariate ma il signing risulta `SKIP`:
Route 53 non lo supporta.

### VPC

- Stato DNSSEC effettivo `ENABLED`. `DISABLED` produce `FAIL`;
  `ENABLING`/`DISABLING` producono `WARN`.
- `enableDnsSupport` e server DNS nelle opzioni DHCP. DNS custom producono
  `WARN`, perche il flag Route 53 non ne dimostra la validazione.
- Regole Resolver associate: forwarding/delegation producono `WARN`, perche
  occorre verificare la validazione sul resolver ricorsivo a valle.

## Interpretazione

| Stato | Significato |
|---|---|
| `OK` | Il singolo controllo automatico e superato. |
| `FAIL` | Requisito del controllo non soddisfatto. |
| `WARN` | Verifica incompleta, stato transitorio o condizione da approfondire. |
| `ERROR` | Impossibile ottenere/interpretare evidenze affidabili, ad esempio AccessDenied, timeout, DNS SERVFAIL. |
| `SKIP` | Controllo non applicabile, ad esempio signing di una zona privata. |

Exit code: **0** senza FAIL/ERROR/WARN; **1** con FAIL; **2** con ERROR o errore
di esecuzione; **3** con soli WARN. ERROR ha precedenza su FAIL, che ha
precedenza su WARN. Un account senza zone pubbliche o una regione senza VPC
producono WARN, per evitare una scansione vuota apparentemente conforme.

## Permessi di lettura

I profili devono poter eseguire:

```text
sts:GetCallerIdentity
route53:ListHostedZones
route53:GetHostedZone
route53:GetDNSSEC
kms:DescribeKey
ec2:DescribeVpcs
ec2:DescribeVpcAttribute
ec2:DescribeDhcpOptions
route53resolver:GetResolverDnssecConfig
route53resolver:ListResolverRuleAssociations
route53resolver:GetResolverRule
```

Per KMS, le autorizzazioni devono consentire `DescribeKey` sulla chiave
interessata anche secondo la relativa key policy.

## Limiti e verifiche manuali

- Le query `dig`/`delv` partono dalla macchina dello script, **non dalle VPC**.
  Possono risentire di cache, split DNS, VPN e trust anchor locali non aggiornati.
  Il resolver deve restituire record DNSSEC per permettere a `delv` di validare.
- AmazonProvidedDNS non restituisce i record DNSSEC e non imposta il bit `AD`,
  anche quando valida. Non usare l'assenza di `AD` come test negativo.
- Da un workload in ciascun percorso DNS effettivo verificare un dominio
  firmato valido, uno deliberatamente bogus (`SERVFAIL`) e uno non firmato.
  Verificare anche la risoluzione dei nomi privati e gli endpoint applicativi.
- Il controllo KMS riguarda i metadati, **non** l'efficacia di key policy, IAM
  e grant. Non sono verificati allarmi CloudWatch, destinatari, procedure di
  rotazione/rollback o requisiti organizzativi del foglio SIP.
- Nessun esito `OK` sostituisce queste verifiche manuali o estende il perimetro
  alle regioni/account non indicati.

## Test senza AWS o DNS

```bash
python3 -B -m unittest discover -s dnssec-audit/tests -v
```

Riferimenti: [signing e catena di fiducia](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-configuring-dnssec-enable-signing.html),
[chiavi KMS](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-configuring-dnssec-cmk-requirements.html),
[validazione VPC](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-dnssec-validation.html).
