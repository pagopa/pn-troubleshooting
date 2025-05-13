# SafeStorage Retention Update

Script per aggiornamento delle date di retention dei documenti in SafeStorage

## Indice

* [Descrizione](#descrizione)
* [Prerequisiti](#prerequisiti)
* [Installazione](#installazione)
* [Utilizzo](#utilizzo)
  * [Configurazione AWS SSO](#configurazione-aws-sso)
  * [File di Output](#file-di-output)
  * [Esempi](#esempi)

## Descrizione

Lo script processa un file CSV contenente informazioni sui documenti e:
- Legge la documentKey e la retentionUntil per ogni riga
- Aumenta di un'ora la data di retention
- Aggiorna i metadati del documento in SafeStorage invocandone le API

## Prerequisiti

- Node.js >= 18.0.0
- Variabile d'ambiente BASE_URL configurata con l'endpoint di SafeStorage
- File CSV con i documenti da aggiornare

## Installazione

```bash
npm install
```

## Utilizzo

### Configurazione AWS SSO

```bash
node index.js --csvFile <path-to-csv>
```
oppure
```bash
node index.js -f <path-to-csv>
```
### Parametri

- --csvFile, -f: Obbligatorio. Percorso del file CSV contenente i documenti
- --help, -h: Visualizza il messaggio di aiuto

### File di Output

Lo script mostra:

- Numero totale di documenti processati
- Progresso in tempo reale
- Eventuali errori durante l'elaborazione


### Esempi

```bash
node index.js --csvFile ./PN-13809.csv
```