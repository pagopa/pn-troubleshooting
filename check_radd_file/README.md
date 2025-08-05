# Check RADD File

Script Python per la validazione di file CSV delle sedi RADD secondo specifiche RFC-4180.

## Funzionalità

### Validazioni formato

- ✅ Conformità RFC-4180 con separatore punto e virgola (`;`)
- ✅ Presenza header obbligatoria
- ✅ Struttura campi secondo specifiche

### Validazioni contenuto

- ✅ Campi obbligatori: `paese`, `città`, `provincia`, `cap`, `via`, `descrizione`, `telefono`, `externalCode`
- ✅ Formato telefono: solo numeri 0-9, massimo 11 caratteri
- ✅ Date: formato `YYYY-MM-DD` con validazione logica
- ✅ Coordinate geografiche: formato `latitudine, longitudine`
- ✅ Orari apertura: pattern strutturato (`Mon=09:00-12:00#Tue=...`)
- ✅ Validazione CAP/Comuni tramite API ISTAT
- ✅ Controllo duplicati `externalCode`
- ✅ Ordinamento discendente su `externalCode`
- ✅ Validazione logica date (inizio < fine validità)

## Struttura campi attesa

| Campo | Tipo | Formato | Esempio |
|-------|------|---------|---------|
| paese | Obbligatorio | Testo | `Italia` |
| città | Obbligatorio | Testo | `Roma` |
| provincia | Obbligatorio | Testo | `RM` |
| cap | Obbligatorio | Numerico | `00100` |
| via | Obbligatorio | Testo | `Via Roma, 1` |
| dataInizioValidità | Opzionale | YYYY-MM-DD | `2024-03-27` |
| dataFineValidità | Opzionale | YYYY-MM-DD | `2024-12-31` |
| descrizione | Obbligatorio | Testo | `Descrizione punto` |
| orariApertura | Opzionale | Pattern | `Mon=09:00-12:00_16:00-19:00#Tue=09:00-19:00` |
| coordinateGeoReferenziali | Opzionale | lat, lon | `41.40338, 2.17403` |
| telefono | Obbligatorio | Numerico | `0612345678` |
| capacità | Opzionale | Numerico | `100` |
| externalCode | Obbligatorio | Alfanumerico | `EXT001` |

## Installazione

```bash
pip install -r requirements.txt
```

## Utilizzo

```bash
python csv_validator.py input.csv
```

### Parametri

- `input.csv`: File CSV da validare

### Output

- **File di output**: `results/<nome_file>_errors.csv`
- **Colonna ERRORI**: Dettagli specifici per ogni errore rilevato
- **Riepilogo terminale**: Statistiche di validazione

### Exit codes

- `0`: Validazione superata
- `1`: Errori rilevati

## Esempio output

```shell
=== VALIDAZIONE CSV ===
File: data.csv
✅ Formato CSV valido
📄 File di output generato: results/data_errors.csv

=== RIEPILOGO VALIDAZIONE ===
Righe totali processate: 150
Righe con errori: 5
ExternalCode duplicati: 2

- 'EXT001': righe 45, 78
❌ VALIDAZIONE FALLITA - Errori rilevati
```

## API ISTAT

Lo script utilizza l'API pubblica ISTAT per la validazione corrispondenza CAP/Comuni:

- URL: `https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.csv`
- Cache integrata per non scaricare ripetutamente lo stesso elenco
- Fallback graceful in caso di problemi di connettività

## Note

- Dimensioni file supportate: < 10MB
- Timeout API: 10 secondi
- Validazione CAP semplificata (verifica esistenza comune)
