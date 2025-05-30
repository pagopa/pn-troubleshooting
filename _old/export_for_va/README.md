# Script Export For VA

lo script export_eni.sh esegue l'estrazione di tutte le schede di rete di un account AWS, creando due file CSV:
 - Un CSV con l'export totale di tutte le interfaccie di rete di un account AWS
 - Uno o piu' CSV opportunamente filtrati e senza duplicati (instanze multiple) in base alla zona dove eseguire le attivita'

i CSV contengono con le seguenti infomrazioni:
 - Network Interface (eni1234567)
 - Ip Address
 - Availability Zone
 - Interface Type
 - Description (quest'ultimo valore utlizzato per raggruppare la tipologia)
 - VpcId
 - SecurityGroupName

lo script export_rules.sh esegue l'estrazione di tutta una serie di informazioni per poter agevolare la revisione periodica delle regole FW/WAF/SG in particolare:
- WAF: Per ogni WebAcl vengono collezionate le rispettive regole WAF e le risorse ad esso associate
- API-GATEWAY: vengono collezionati tutti i domini con le rispettive API e la versione TLS
- LOAD-BALANCER: Lista di tutti i load-balancer con le rispettive porte di ascolto, i target/action e se si tratta di un load-balancer interno/esterno
- SECURITY-GROUP: elenco di tutti i SG con nome,descrizione,vpc di appartenza e le regole inbound/outbound (porte/subnet)
N.B: il risultato dello script sono quattro CSV, uno per ogni tipologia di analisi effettuata.

# Esecuzione

./export_rules.sh -p <aws-profile> -r <aws-region>

./export_eni.sh -p <aws-profile> -r <aws-region>

Dove:
- `<aws-profile>` è il profilo dell'account AWS;
- `<aws-region>` è la region AWS
