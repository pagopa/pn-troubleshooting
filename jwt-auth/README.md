# JWT Auth

Helper scripts per la generazione di JWKS e JWT firmati.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo script generate-jwks.js genera il JWKS a partira da una chiave pubblica RSA.

Lo script generate-jwt.js genera il JWT firmandolo con una chiave privata RSA.

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare: generazione coppia di chiavi RSA

```bash
openssl genrsa -out ./private.key 4096  
openssl rsa -in private.key -pubout -outform PEM -out public.key
```

### Esecuzione Generate JWT

```bash
generate-jwt.js --privateKey <privateKey> --aud <aud> --iss <iss> --jti <jti> --kid <kid> --expiresIn <expiresIn> --virtual_key <virtual_key>
```

Dove:
- `<privateKey>` è il path alla chiave privata RSA
- `<aud>` è il valore per il campo `aud` del JWT
- `<iss>` è il valore per il campo `iss` del JWT
- `<jti>` è il valore per il campo `jti` del JWT
- `<kid>` è il nome della coppia di chiavi RSA
- `<expiresIn>` è la durata del token (es. `1y` , `1h` , `30m` ...)
- `<virtual_key>` la virtual key associata all'utente (non mandatoria)

Usage Example:
```bash
node generate-jwt.js --privateKey ~/Downloads/private-ta.key --aud https://api.radd.dev.notifichedigitali.it --iss ta-issuer.dev.notifichedigitali.it --jti 1231231312 --kid "abc-123" --expiresIn 1y
```

### Esecuzione Generate JWKS

```bash
generate-jwks.js --publicKey <publicKey> --kid <kid>
```

Dove:
- `<publicKey>` è il path alla chiave pubblica
- `<kid>` è il nome della coppia di chiavi RSA
(opzionale)


Usage Example:

```bash
node generate-jwks.js --publicKey ~/Downloads/public-TA.key --kid abc-123
```
