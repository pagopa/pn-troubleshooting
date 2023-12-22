# pn-paper-channel
Microservizio responsabile della gestione dei flussi di spedizione delle notifiche analogiche, in sinergia con pn-delivery-push e si occupa di gestire le operazioni sui recapitisti.

## Diagramma ER
```mermaid
erDiagram
    pn-PaperRequestDelivery ||--|| pn-PaperAddress : ""
    pn-PaperRequestDelivery ||--o{ pn-PaperEvents : ""
    pn-PaperRequestDelivery ||--|| pn-PaperRequestError : ""
    pn-Notifications ||--o{ pn-PaperRequestDelivery : ""
```

```mermaid
erDiagram
    pn-PaperDeliveryDriver ||--|{ pn-PaperCost : ""
    pn-PaperDeliveryDriver ||--|| pn-PaperTender : ""
```

```mermaid
erDiagram
    pn-Clients
    pn-PaperDeliveryFile
    pn-PaperCap
    pn-PaperZone
```