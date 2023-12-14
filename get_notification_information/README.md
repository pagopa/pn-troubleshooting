# Notification Information

Descrizione tabelle Dynamo di notificazione.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Contenuto](#contenuto)
    - [pn-confinfo](#pn-confinfo)
        - [PnSsTableDocumentiStreamMetadati](#PnSsTableDocumentiStreamMetadati)
        - [pn-AuditStorage](#pn-AuditStorage)
        - [pn-ConfidentialObjects](#pn-ConfidentialObjects)
        - [pn-EcAnagrafica](#pn-EcAnagrafica)
        - [pn-EcRichieste](#pn-EcRichieste)
        - [pn-EcRichiesteMetadati](#pn-EcRichiesteMetadati)
        - [pn-ExtChannels](#pn-ExtChannels)
        - [pn-SmStates](#pn-SmStates)
        - [pn-SsAnagraficaClient](#pn-SsAnagraficaClient)
        - [pn-SsDocumenti](#pn-SsDocumenti)
        - [pn-SsTipologieDocumenti](#pn-SsTipologieDocumenti)
        - [pn-VerificationCode2](#pn-VerificationCode2)
        - [pn-addressManager-AnagraficaClient](#pn-addressManager-AnagraficaClient)
        - [pn-addressManager-Cap](#pn-addressManager-Cap)
        - [pn-addressManager-Country](#pn-addressManager-Country)
        - [pn-addressManager-NormalizzatoreBatch](#pn-addressManager-NormalizzatoreBatch)
        - [pn-addressManager-NormalizzatoreBatch-Test](#pn-addressManager-NormalizzatoreBatch-Test)
        - [pn-addressManager-PNRequest](#pn-addressManager-PNRequest)
        - [pn-addressManager-PNRequest-Test](#pn-addressManager-PNRequest-Test)
        - [pn-addressManager-ShedLock](#pn-addressManager-ShedLock)
        - [pn-legal-conservation-request](#pn-legal-conservation-request)
        - [pn-legal-conservation-request-history](#pn-legal-conservation-request-history)
    - [pn-core](#pn-core)
        - [Downtime-DowntimeLogs](#Downtime-DowntimeLogs)
        - [Downtime-Event](#Downtime-Event)
        - [pn-Action](#pn-Action)
        - [pn-AuditStorage](#pn-AuditStorage)
        - [pn-Clients](#pn-Clients)
        - [pn-CostComponents](#pn-CostComponents)
        - [pn-CostUpdateResult](#pn-CostUpdateResult)
        - [pn-DocumentCreationRequestTable](#pn-DocumentCreationRequestTable)
        - [pn-ExtChannels](#pn-ExtChannels)
        - [pn-F24File](#pn-F24File)
        - [pn-F24MetadataSet](#pn-F24MetadataSet)
        - [pn-FutureAction](#pn-FutureAction)
        - [pn-IOMessages](#pn-IOMessages)
        - [pn-LastPollForFutureActionTable](#pn-LastPollForFutureActionTable)
        - [pn-Mandate](#pn-Mandate)
        - [pn-MandateHistory](#pn-MandateHistory)
        - [pn-NotificationDelegationMetadata](#pn-NotificationDelegationMetadata)
        - [pn-Notifications](#pn-Notifications)
        - [pn-NotificationsCost](#pn-NotificationsCost)
        - [pn-NotificationsMetadata](#pn-NotificationsMetadata)
        - [pn-NotificationsQR](#pn-NotificationsQR)
        - [pn-OnboardInstitutions](#pn-OnboardInstitutions)
        - [pn-OptInSent](#pn-OptInSent)
        - [pn-PaperAddress](#pn-PaperAddress)
        - [pn-PaperCap](#pn-PaperCap)
        - [pn-PaperCost](#pn-PaperCost)
        - [pn-PaperDeliveryDriver](#pn-PaperDeliveryDriver)
        - [pn-PaperDeliveryFile](#pn-PaperDeliveryFile)
        - [pn-PaperEvents](#pn-PaperEvents)
        - [pn-PaperNotificationFailed](#pn-PaperNotificationFailed)
        - [pn-PaperRequestDelivery](#pn-PaperRequestDelivery)
        - [pn-PaperRequestError](#pn-PaperRequestError)
        - [pn-PaperTender](#pn-PaperTender)
        - [pn-PaperZone](#pn-PaperZone)
        - [pn-PnActivityReport](#pn-PnActivityReport)
        - [pn-PnDeliveryPushShedLock](#pn-PnDeliveryPushShedLock)
        - [pn-PnEstimate](#pn-PnEstimate)
        - [pn-PnProfilation](#pn-PnProfilation)
        - [pn-PnServiceDeskAddress](#pn-PnServiceDeskAddress)
        - [pn-PnServiceDeskClient](#pn-PnServiceDeskClient)
        - [pn-PnServiceDeskOperationFileKey](#pn-PnServiceDeskOperationFileKey)
        - [pn-PnServiceDeskOperations](#pn-PnServiceDeskOperations)
        - [pn-ProgressionSensorData](#pn-ProgressionSensorData)
        - [pn-Timelines](#pn-Timelines)
        - [pn-TimelinesCounters](#pn-TimelinesCounters)
        - [pn-TimelinesForInvoicing](#pn-TimelinesForInvoicing)
        - [pn-UserAttributes](#pn-UserAttributes)
        - [pn-VerificationCode2](#pn-VerificationCode2)
        - [pn-WebhookEvents](#pn-WebhookEvents)
        - [pn-WebhookStreams](#pn-WebhookStreams)
        - [pn-address-manager-apikey](#pn-address-manager-apikey)
        - [pn-address-manager-batch-request](#pn-address-manager-batch-request)
        - [pn-address-manager-cap](#pn-address-manager-cap)
        - [pn-address-manager-country](#pn-address-manager-country)
        - [pn-address-manager-postel-batch](#pn-address-manager-postel-batch)
        - [pn-aggregates](#pn-aggregates)
        - [pn-apiKey](#pn-apiKey)
        - [pn-batchPolling](#pn-batchPolling)
        - [pn-batchRequests](#pn-batchRequests)
        - [pn-counter](#pn-counter)
        - [pn-document-ready](#pn-document-ready)
        - [pn-operations-iuns](#pn-operations-iuns)
        - [pn-paAggregations](#pn-paAggregations)
        - [pn-radd-transaction](#pn-radd-transaction)

## Descrizione

Contiene la lista delle tabelle Dynamo legate al processo di notificazione, con descrizione e referente tecnico.

## Contenuto

Di seguito sono riportate, in forma tabellare, tutte le informazioni relative alle tabelle Dynamo legate al processo di notificazione.
Tutte le tabelle censite vengono mostrate in cascata insieme alle informazioni: microservizio che si occupa di gestire l'accesso alla tabella, descrizione funzionale della tabella, uno o più referenti tecnici.

Le tabelle sono mostrate suddivise per Account AWS in modo da poterle raggruppare e identificare più agilmente.

### pn-confinfo

##### PnSsTableDocumentiStreamMetadati 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-AuditStorage 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-ConfidentialObjects 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-EcAnagrafica 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-EcRichieste 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-EcRichiesteMetadati 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-ExtChannels 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-SmStates 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-SsAnagraficaClient 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-SsDocumenti 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-SsTipologieDocumenti 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-VerificationCode2 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-addressManager-AnagraficaClient 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-addressManager-Cap 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-addressManager-Country 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-addressManager-NormalizzatoreBatch 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-addressManager-NormalizzatoreBatch-Test 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-addressManager-PNRequest 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-addressManager-PNRequest-Test 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-addressManager-ShedLock 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-legal-conservation-request 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-legal-conservation-request-history 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO

### pn-core

##### Downtime-DowntimeLogs 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### Downtime-Event 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-Action 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-AuditStorage 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-Clients 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-CostComponents 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-CostUpdateResult 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-DocumentCreationRequestTable 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-ExtChannels 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-F24File 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-F24MetadataSet 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-FutureAction 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-IOMessages 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-LastPollForFutureActionTable 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-Mandate 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-MandateHistory 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-NotificationDelegationMetadata 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-Notifications 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-NotificationsCost 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-NotificationsMetadata 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-NotificationsQR 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-OnboardInstitutions 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-OptInSent 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PaperAddress 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PaperCap 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PaperCost 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PaperDeliveryDriver 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PaperDeliveryFile 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PaperEvents 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PaperNotificationFailed 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PaperRequestDelivery 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PaperRequestError 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PaperTender 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PaperZone 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PnActivityReport 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PnDeliveryPushShedLock 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PnEstimate 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PnProfilation 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PnServiceDeskAddress 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PnServiceDeskClient 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PnServiceDeskOperationFileKey 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PnServiceDeskOperations 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-ProgressionSensorData 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-Timelines 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-TimelinesCounters 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-TimelinesForInvoicing 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-UserAttributes 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-VerificationCode2 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-WebhookEvents 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-WebhookStreams 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-address-manager-apikey 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-address-manager-batch-request 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-address-manager-cap 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-address-manager-country 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-address-manager-postel-batch 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-aggregates 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-apiKey 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-batchPolling 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-batchRequests 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-counter 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-document-ready 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-operations-iuns 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-paAggregations 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-radd-transaction 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 