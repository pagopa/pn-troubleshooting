# Verify if exists or stolen

Verifica se un requestId scartato da ExternalChannel esiste in pn-EcRichiesteMetadati e se il suo precedente tentativo è in uno stato furtato.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Verifica se un requestId scartato da ExternalChannel esiste in pn-EcRichiesteMetadati e se il suo precedente tentativo è in uno stato furtato.

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-confinfo-<env>
```

### Esecuzione
```bash
node index.js --envName <envName> --fileName <fileName>
```
Dove:
- `<envName>` l'env dove viene eseguito lo script;
- `<fileName>` file dato in input allo script;

formato del file
PREPARE_ANALOG_DOMICILE.IUN_XXXX-XXXX-XXXX-202310-L-1.RECINDEX_0.ATTEMPT_0.PCRETRY_2
PREPARE_ANALOG_DOMICILE.IUN_XXXX-XXXX-XXXX-202310-U-1.RECINDEX_0.ATTEMPT_0.PCRETRY_2
PREPARE_ANALOG_DOMICILE.IUN_XXXX-XXXX-XXXX-202310-K-1.RECINDEX_0.ATTEMPT_0.PCRETRY_2