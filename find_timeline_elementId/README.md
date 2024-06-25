# Find Timeline Element Id
Verifica in timeline se è presente uno dei seguenti timeline_element_id

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script prende in input il file fornito in output da timelines_from_iuns e fornisce in output dei file in base alle categories che si vogliono cercare, è importante l'ordinamento di inserimento delle categories perchè viene considerato lo XOR durante la ricerca

## Installazione

```bash
npm install
```

## Utilizzo

### Esecuzione
```bash
node index.js --fileName <file-name> --categories <category1,category2,...> [--outputFolder <output-folder>]
```
Dove:
- `<fileName>` è il file-path del file che riporta i requestId di interesse;
- `<category1,category2,...>` sono i timeline element id che si voglione cercare es REFINEMENT
- `<output-folder>` output folder nella cartella result

