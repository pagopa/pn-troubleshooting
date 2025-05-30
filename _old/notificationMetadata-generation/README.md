# notificationMetadata analysis
Effettua richieste verso pn-delivery per aggiornare pn-NotificationMetadata

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Effettua richieste verso pn-delivery per aggiornare pn-NotificationMetadata

## Installazione

```bash
npm install
```

## Utilizzo

### Esecuzione
```bash
node index.js --envName <env-name> --fileName <file-name> [--dryrun]
```
Dove:
- `<env-name>` è l'environment sul quale si intende eseguire l'operazione;
- `<file-name>` è il csv generato dallo script "notificationMetadata-generation";
- `dryrun` indica se si vuole eseguire in read-only.
