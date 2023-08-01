## Get Updated Address Data

Per poter avviare lo Script eseguire gli steps:

Installare dipendenze node:
`npm install`

Eseguire il comando:
`node index.js <aws-profile-core> <env-type> <request-id>`

Dove:
- `<aws-profile-core>` è il profilo dell'account AWS core;
- `<env-type>` è l'environment: dev, test, uat, hotfix, prod;
- `<request-id>` è il request id del messaggio desiderato.

Lo script genera una cartella in `edits/{request_id}_{yyyy-MM-dd'T'HH:mm:ss. SSSXXX}` con i seguenti file:
- **originalAddress.json**: indirizzo originale
- **updatedAddress.json**: indirizzo aggiornato secondo gli input in fase di esecuzione
- **updatedEncryptedAddress.json**: valori crittografati dell'indirizzo aggiornato
- **updatedAddressHash.json**: hash dell'indirizzo aggiornato
- **addressDiff.diff**: diff tra originalAddress.json e updatedAddress.json

Nota: le proprietà che identificano l'indirizzo sono: `address`, `fullName`, `nameRow2`, `addressRow2`, `cap`, `city`, `city2`, `pr`, `country`.