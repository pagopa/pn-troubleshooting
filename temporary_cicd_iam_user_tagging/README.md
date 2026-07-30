# Temporary CICD IAM user tagging

Script temporaneo per allineare i tag degli utenti IAM ai tag delle policy
collegate ai gruppi di appartenenza.

Per ogni utente calcola l'unione dei tag con prefisso `pn-` presenti sulle
policy IAM collegate ai suoi gruppi e imposta i tag mancanti o con valore
differente.

## Requisiti

- Python 3.9 o successivo
- credenziali AWS configurate tramite profilo
- `boto3`

Installazione della dipendenza:

```shell
python3 -m pip install -r requirements.txt
```

Il profilo deve poter eseguire almeno:

- `sts:GetCallerIdentity`
- `iam:ListGroups`
- `iam:GetGroup`
- `iam:ListAttachedGroupPolicies`
- `iam:ListPolicyTags`
- `iam:ListUsers`
- `iam:ListUserTags`
- `iam:TagUser` quando si usa `--apply`
- `iam:UntagUser` quando si usano insieme `--apply --remove-stale`

## Utilizzo

Per analizzare lo stato senza effettuare modifiche:

```shell
python3 reconcile_user_tags.py --profile <aws-profile> --analysis
```

Per applicare i tag mancanti o correggere quelli con valore differente:

```shell
python3 reconcile_user_tags.py --profile <aws-profile> --apply
```

Lo script non rimuove tag per default, perché potrebbero esistere tag `pn-*`
assegnati manualmente. Per riconciliare anche le rimozioni:

```shell
python3 reconcile_user_tags.py \
  --profile <aws-profile> \
  --analysis \
  --remove-stale

python3 reconcile_user_tags.py \
  --profile <aws-profile> \
  --remove-stale \
  --apply
```

Il primo comando mostra in analysis mode i tag che verrebbero rimossi; il secondo
applica il piano.

È possibile cambiare il prefisso:

```shell
python3 reconcile_user_tags.py \
  --profile <aws-profile> \
  --analysis \
  --tag-prefix pn-
```

Avviare lo script senza `--analysis` o `--apply` non esegue chiamate AWS:
viene mostrato un errore che descrive le due modalità e richiede una scelta
esplicita.

L'output JSON riporta sempre un avviso sulla modalità, account, modalità di
esecuzione e delta per utente. Se due policy assegnano valori differenti alla
stessa chiave per lo stesso utente, lo script termina senza applicare
modifiche.

## Report di esecuzione

Ogni esecuzione crea automaticamente la cartella `output` accanto allo script
e salva un report con un nome simile al seguente:

```text
output/user-tagging-20260730T153012123456Z-123456789012-analysis.json
```

La cartella `output/` è esclusa da Git tramite `.gitignore`, perché i report
possono contenere nomi di utenti IAM e non devono essere committati.

Il report contiene:

- account AWS e profilo utilizzato;
- modalità `ANALYSIS` oppure `APPLY`;
- prefisso esaminato;
- indicazione dell'eventuale rimozione dei tag obsoleti;
- utenti coinvolti e relativo delta;
- stato dell'esecuzione;
- numero di tag impostati e rimossi, in modalità `APPLY`.

Lo stato può assumere i seguenti valori:

- `ANALYSIS_COMPLETE`: analisi completata senza scritture;
- `PLANNED`: piano salvato prima di iniziare le scritture;
- `COMPLETED`: applicazione terminata correttamente;
- `FAILED`: errore AWS durante l'applicazione; il report contiene anche
  l'errore ricevuto.

Il contenuto viene mostrato anche sul terminale. Al termine lo script stampa
il percorso completo del file generato.
