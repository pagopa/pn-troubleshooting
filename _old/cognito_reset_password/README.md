# Reset password Cognito

Imposta una nuova password per un utente Cognito

## Utilizzo

```bash
./reset-cognito-pwd.sh -r <aws-region> -p <aws-profile> -x <new-password> -e <email> -c <cognito-user-pool>
```
Dove:
- `<aws-profile>` è il profilo dell'account AWS dell'ambiente di riferimento.
- `<aws-region>` é la region AWS dove risiede lo user pool Cognito
- `<new-password>` è la nuova password
- `<email>` è l'email dell'utente per il quale generare una nuova password
- `<cognito-user-pool>` è l'ID dello user pool cognito (da recuperare da console AWS)

I vincoli della password sono:
- lunghezza minima: 16
- 1 numero
- 1 lettera minuscola
- 1 lettera maiuscola
- 1 carattere speciale tra: ^ $ * . [ ] { } ( ) ? - " ! @ # % & / \ , > < ' : ; | _ ~ ` + =

**La password dovrà essere modificata dall'utente al primo accesso**
