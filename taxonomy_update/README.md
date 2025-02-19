# Taxonomy automation

Gli script in questa directory hanno lo scopo di automatizzare gli aggiornamenti
dei codici tassonomici di SEND per:

1. Aggiornamento documentazione
2. Aggiornamento della tabella `pn-TaxonomyCode`

## Sorgente dei dati

La tassonomia di SEND viene aggiornata su un gsheet accessibile pubblicamente
tramite [link](https://docs.google.com/spreadsheets/d/1yhfQveEnAE6kZDkGFAGAABsItgCbYRs83ldCM7BwKRQ/export)

Da questo link viene scaricata con lo script `getTaxonomyFromSheet.py` in
formato csv e salvata sul file `send-taxomony.csv`, che ha il ruolo di sorgente
per gli script successivi.

Lo script `sortTaxonomyCsv.py` ha il compito di ordinare i codici tassonomici

```bash
python getTaxonomyFromSheet.py
python sortTaxonomyCsv.py
```

## 1. Aggiornamento documentazione

La [pagina gitbook](https://docs.pagopa.it/f.a.q.-per-integratori/tassonomia-send) di documentazione resa disponibile
sul developer portal all'indirizzo https://developer.pagopa.it/send/guides/knowledge-base/tassonomia-send

Esempio:

`python createMD.py  | tee $DEVPORTAL_REPO/docs/3FyVXetkmOApT9WPTwPN/tassonomia-send.md`

## 2. Aggiornamento tabella pn-TaxonomyCode

La tabella `pn-TaxonomyCode` è al momento utilizzata per la validazione dei codici
tassonomici delle notifiche inserite.

`python createJsonTable.py | tee $PN_CONF_REPO/prod/_conf/core/dynamodb/pn-TaxonomyCode.json`

## Inizializzazione Virtual Environment Python

```bash
python3 -m venv .venv
.venv/bin/activate
pip install -r requirements.txt
```