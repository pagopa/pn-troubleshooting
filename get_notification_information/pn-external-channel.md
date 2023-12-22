# pn-external-channel
Modulo applicativo che si occupa di astrarre e gestire gli invii di comunicazione attraverso uno dei 4 canali attualmente disponibili (SMS, email, PEC e cartaceo)

## Diagramma ER
```mermaid
erDiagram
    pn-EcRichieste ||--|| pn-EcRichiesteMetadati : ""
    pn-EcAnagrafica ||--|| pn-EcRichiesteMetadati : ""
```