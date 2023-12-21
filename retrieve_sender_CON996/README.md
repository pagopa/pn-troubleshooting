# retrieve sender CON996

Script che recupera denomination e senderPaID di uno IUN

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script, dato in input un file che ad una serie di IUN, ne estrae le informazioni di denomination e senderPaID.
Il file è un .txt con gli IUN separati da "newline".

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile <profile>
```

### Esecuzione
```bash
node index.js --envName <envName> --fileName <fileName>
```
Dove:
- `<envName>` è l'environment nel quale si intende eseguire lo script;
- `<fileName>` è il path del file che contiene la serie di IUN da ricercare;