# Data Extractor

Script che supporta l'estrazione di dati come log ed eventi.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script effettua operazioni di estrazione di dati in base alle informazioni fornite in input. Tra le informazione che può estrarre vi sono logs o messaggi in DLQ.
Lo Script è capace attualmente di analizzare:
- allarmi di tipo Fatal e ApiGateway;
- ricercare nei log di un LogGroup tramite in valore di input;
- ricercare in base ad una request e trace id dato in input;

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-confinfo-<env>
aws sso login --profile sso_pn-core-<env>
```

### Esecuzione
```bash
node ./src/index.js --envName <env-name> --alarm|--input|--url <alarm>|<input>|<url> [--start \"<start>\" --logGroups \"<logGroups>\" --traceId <traceId> --limit <limit>]

```
Dove:
- `<env-name>` è l'environment sul quale si intende estrarre informazioni; (obbligatorio)
- `<alarm>` è l'allarme del quale si vogliono cercare informazioni; 
- `<input>` è un valore chiave sul quale si vogliono cercare informazioni;
- `<url>` è l'url sul quale si vogliono cercare informazioni;
- `<start>` data e orario di inizio della ricerca, è importante inserirlo nel seguente formato (DD/MM/YY HH:mm:ss); (obbligatorio per alarm|input|url)
- `<logGroups>` è l'array dei log groups sul quale si vuole effettuare la ricerca su un valore <input>; (obbligatorio per input, da separare con ",")
- `<traceId>` è il trace id di riferimento ottenuto in risposta dalla richiesta indicata in <url>; (obbligatorio per url)
- `<limit>` è il limite massimo di trace id che lo script analizzera nella propria ricerca (default=20);

Usage Example:
```bash
node ./src/index.js --envName prod --alarm oncall-pn-external-channel-ErrorFatalLogs-Alarm --start "08/08/23 17:46:00"
```
```bash
node ./src/index.js --envName dev --alarm pn-delivery-progress-B2B-ApiGwAlarm --start "21/08/23 18:44:00"
```