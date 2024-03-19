# Diff document template

Verifica se ci sono modifiche tra due versioni sulla generazione dei template dei documenti.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script, dato in input due tag, verifica ci sono delle modifiche nel path che riguarda il template dei documenti.

## Installazione

```bash
npm install
```

## Utilizzo
### Esecuzione
```bash
node index.js --tags <tags> [--files]
```
Dove:
- `<tags>` sono i tags sul quale si vuole eseguire la diff;
- `<files>` (opzionale) se si vogliono conoscere solo i file modificati;

**ESEMPIO ESECUZIONE**:
node index.js --tags v2.5.3,v2.5.2