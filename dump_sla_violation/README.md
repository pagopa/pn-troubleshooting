# dump_sla_violation

Script di Scan che esegue un dump della tabella DynamoDB di progression sensor per recuperare gli iun relaliti alle SLA violate.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script, dato in input una tipologia di SLA ti restituisce tutti gli iun che hanno la suddetta SLA.

## Installazione

```bash
npm install
```

## Utilizzo

```bash
node index.js --awsProfile <aws-profile> --slaViolation <sla-violation>"
```
Dove:
- `<aws-profile>` è il profilo dell'account AWS dell'ambiente di riferimento.
- `<sla-violation>` é la tipologia di SLA violata che si intende estrarre. ["SEND_PAPER_AR_890", "REFINEMENT", "VALIDATION", "SEND_PEC", "SEND_AMR"]