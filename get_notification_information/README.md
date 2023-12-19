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

Di seguito sono riportate le informazioni relative alle tabelle Dynamo legate al processo di notificazione.
Tutte le tabelle censite vengono mostrate in cascata insieme alle seguenti informazioni: microservizio che si occupa di gestire l'accesso alla tabella, descrizione funzionale della tabella, uno o più referenti tecnici.

Le tabelle sono mostrate suddivise per Account AWS (indipendente dall'ambiente) in modo da poterle raggruppare e identificare più agilmente.

---

### pn-confinfo

##### PnSsTableDocumentiStreamMetadati 

 - **Microservizio**: pn-ss
 - **Descrizione funzionale**: cursori degli stream dynamo di Safe Storage
 - **Referente tecnico**: Bing, TPM ff

##### pn-AuditStorage 

 - **Microservizio**: pn-logsaver
 - **Descrizione funzionale**: tabella contenente le chiavi S3 dei file di log
 - **Referente tecnico**: mi

##### pn-ConfidentialObjects 

 - **Microservizio**: pn-datavault
 - **Descrizione funzionale**: pseoudo anonimizzazione
 - **Referente tecnico**: vr / mv

##### pn-EcAnagrafica 

 - **Microservizio**: pn-ec (External Channel)
 - **Descrizione funzionale**: elenco microservizi che possono invocare pn-ec
 - **Referente tecnico**: ff / mi

##### pn-EcRichieste 

 - **Microservizio**: pn-ec
 - **Descrizione funzionale**: richieste effettuate a pn-ec
 - **Referente tecnico**: ff / mi

##### pn-EcRichiesteMetadati 

 - **Microservizio**: pn-ec
 - **Descrizione funzionale**: proggressione dell'andamento delle risposte alle richieste fatte (cartaceo e PEC)
 - **Referente tecnico**: ff / mi

##### pn-ExtChannels 

 - **Microservizio**: mock pn-ec
 - **Descrizione funzionale**: tabella in viene registrato il contenuto dei messaggi inviati dal mock di ec
 - **Referente tecnico**: vr

##### pn-SmStates 

 - **Microservizio**: pn-statemachinemanager
 - **Descrizione funzionale**: diagramma degli stati per PEC, cartaceo e documenti su safestorage
 - **Referente tecnico**: ff / mi

##### pn-SsAnagraficaClient 

 - **Microservizio**: pn-ss
 - **Descrizione funzionale**: elenco microservizi che possono invocare pn-ss
 - **Referente tecnico**: ff / mi

##### pn-SsDocumenti 

 - **Microservizio**: pn-ss
 - **Descrizione funzionale**: elenco documenti contenuti in safestorage
 - **Referente tecnico**: ff / mi

##### pn-SsTipologieDocumenti 

 - **Microservizio**: pn-ss
 - **Descrizione funzionale**: configurazioni del ciclo di vita dei documenti contenuti in safestorage
 - **Referente tecnico**: ff / mi

##### pn-VerificationCode2 

 - **Microservizio**: mock pn-ec
 - **Descrizione funzionale**: non lo so
 - **Referente tecnico**: vr

##### pn-addressManager-AnagraficaClient 

 - **Microservizio**: pn-address-manager
 - **Descrizione funzionale**: elenco microservizi che possono invocare pn-address-manager
 - **Referente tecnico**: ff

##### pn-addressManager-Cap 

 - **Microservizio**: pn-address-manager
 - **Descrizione funzionale**: tabella dei cap supportati da SeND per le spedizioni
 - **Referente tecnico**: ff

##### pn-addressManager-Country 

 - **Microservizio**: pn-address-manager
 - **Descrizione funzionale**: tabella degli stati esteri supportati da SeND per le spedizioni
 - **Referente tecnico**: ff

##### pn-addressManager-NormalizzatoreBatch 

 - **Microservizio**: pn-address-manager
 - **Descrizione funzionale**: tabella dei "batch di polling" utilizzati per ottenere le risposte da IniPEC
 - **Referente tecnico**: ff

##### pn-addressManager-NormalizzatoreBatch-Test 

 - **Microservizio**: pn-address-manager
 - **Descrizione funzionale**: non so
 - **Referente tecnico**: ff

##### pn-addressManager-PNRequest 

 - **Microservizio**: pn-address-manager
 - **Descrizione funzionale**: non so
 - **Referente tecnico**: ff

##### pn-addressManager-PNRequest-Test 

 - **Microservizio**: pn-address-manager
 - **Descrizione funzionale**: non so
 - **Referente tecnico**: ff

##### pn-addressManager-ShedLock 

 - **Microservizio**: pn-address-manager
 - **Descrizione funzionale**: non so
 - **Referente tecnico**: ff

##### pn-legal-conservation-request 

 - **Microservizio**: pn-cn
 - **Descrizione funzionale**: elenco richieste di conservazione a norma in corso di esecuzione
 - **Referente tecnico**: fd

##### pn-legal-conservation-request-history 

 - **Microservizio**: pn-cn 
 - **Descrizione funzionale**: elenco richieste di conservazione a norma eseguite
 - **Referente tecnico**: fd

---

### pn-core

##### Downtime-DowntimeLogs 

 - **Microservizio**: pn-downtime-logs
 - **Descrizione funzionale**: lassi di tempo in cui c'è stato un down della piattaforma
 - **Referente tecnico**: vm

##### Downtime-Event 

 - **Microservizio**: pn-downtime-logs
 - **Descrizione funzionale**: lassi di tempo in cui c'è stato un evento down o up della piattaforma
 - **Referente tecnico**: vm

##### pn-Action 

 - **Microservizio**: pn-delivery-push
 - **Descrizione funzionale**: azioni eseguite, o in esecuzione.
 - **Referente tecnico**: sr / fl

##### pn-AuditStorage 

 - **Microservizio**: pn-logsaver-be
 - **Descrizione funzionale**: elenco dei file salvati su safestorage (si, è installato in entrambe gli account)
 - **Referente tecnico**: mi

##### pn-Clients 

 - **Microservizio**: pn-paper-channel
 - **Descrizione funzionale**: elenco microservizi che possono invocare paper channel 
 - **Referente tecnico**: ff / vr

##### pn-CostComponents 

 - **Microservizio**: pn-external-registries
 - **Descrizione funzionale**: elenco dei costi inviati a pagoPA nella modalità di integrazione async
 - **Referente tecnico**: sr

##### pn-CostUpdateResult 

 - **Microservizio**: pn-external-registries
 - **Descrizione funzionale**: elenco dei tentativi di invio costi a pagoPA nella modalità di integrazione async
 - **Referente tecnico**: sr

##### pn-DocumentCreationRequestTable 

 - **Microservizio**: pn-delivery-push
 - **Descrizione funzionale**: elenco dei file di cui pn-delivery-push ha richiesto il salvataggio a pn-ss
 - **Referente tecnico**: sr

##### pn-ExtChannels 

 - **Microservizio**: mock pn-ec
 - **Descrizione funzionale**: tabella in viene registrato il contenuto dei messaggi inviati dal mock di ec
 - **Referente tecnico**: vr

##### pn-F24File 

 - **Microservizio**: pn-f24
 - **Descrizione funzionale**: informazioni del singolo f24 (credo)
 - **Referente tecnico**: fl / ntt

##### pn-F24MetadataSet 

 - **Microservizio**: pn-f24
 - **Descrizione funzionale**: informazioni di validazione di un set di f24
 - **Referente tecnico**: fl / ntt

##### pn-FutureAction 

 - **Microservizio**: pn-delivery-push
 - **Descrizione funzionale**: passi del workflow della notifica da effettuare nel futuro 
 - **Referente tecnico**: sr

##### pn-IOMessages 

 - **Microservizio**: pn-external-registries
 - **Descrizione funzionale**: elenco messaggi inviati al backend di AppIO
 - **Referente tecnico**: vr / mt

##### pn-LastPollForFutureActionTable 

 - **Microservizio**: pn-delivery-push
 - **Descrizione funzionale**: timestamp mantenuto da pn-delivery-push per definire quali azioni vanno schedulate
 - **Referente tecnico**: sr

##### pn-Mandate 

 - **Microservizio**: pn-mandate
 - **Descrizione funzionale**: tabelle delle deleghe
 - **Referente tecnico**: fl

##### pn-MandateHistory 

 - **Microservizio**: pn-mandate 
 - **Descrizione funzionale**: tabelle delle deleghe scadute
 - **Referente tecnico**: fl

##### pn-NotificationDelegationMetadata 

 - **Microservizio**: pn-delivery
 - **Descrizione funzionale**: "vista dematerializzata" utilizzata per permettere le ricerche delle PG tra le notifiche ad esse delegate
 - **Referente tecnico**: am

##### pn-Notifications 

 - **Microservizio**: pn-delivery
 - **Descrizione funzionale**: tabelal contenente i metadati delle notifiche
 - **Referente tecnico**: am 

##### pn-NotificationsCost 

 - **Microservizio**: pn-delivery
 - **Descrizione funzionale**: tabella che associa gli IUV agli IUN
 - **Referente tecnico**: am 

##### pn-NotificationsMetadata 

 - **Microservizio**: pn-delivery
 - **Descrizione funzionale**: vista dematerializzata" utilizzata per permettere le ricerche ad ogni dstinatario, delle sue notifiche
 - **Referente tecnico**: am

##### pn-NotificationsQR 

 - **Microservizio**: pn-delivery
 - **Descrizione funzionale**: associazione tra notifiche e QR code presenti negli AAR
 - **Referente tecnico**: am

##### pn-OnboardInstitutions 

 - **Microservizio**: pn-external-registires
 - **Descrizione funzionale**: elenco degli enti / AOO /UO che hanno fatto onboarding in PN
 - **Referente tecnico**: vr / mt

##### pn-OptInSent 

 - **Microservizio**: pn-external-registires
 - **Descrizione funzionale**: elenco messaggi di OptIn inviati al back-end di AppIO
 - **Referente tecnico**: vr / mt

##### pn-PaperAddress 

 - **Microservizio**: pn-paper-channel
 - **Descrizione funzionale**: elenco indirizzi contenuti nelle richieste cartacee
 - **Referente tecnico**: ff / vr

##### pn-PaperCap 

 - **Microservizio**: pn-paper-channel
 - **Descrizione funzionale**: elenco cap ammessi da SeND
 - **Referente tecnico**: ff / vr

##### pn-PaperCost 

 - **Microservizio**: pn-paper-channel
 - **Descrizione funzionale**: elenco costi degli invii cartacei
 - **Referente tecnico**: ff / vr

##### pn-PaperDeliveryDriver 

 - **Microservizio**: pn-paper-channel
 - **Descrizione funzionale**: elenco recapitisti avvisi cartacei
 - **Referente tecnico**: ff / vr

##### pn-PaperDeliveryFile 

 - **Microservizio**: pn-paper-channel
 - **Descrizione funzionale**: file contenenti le informazioni delle gare di recapito e consolidamento
 - **Referente tecnico**: ff / vr

##### pn-PaperEvents 

 - **Microservizio**: pn-paper-channel
 - **Descrizione funzionale**: eventi relativi agli invii cartacei calcolati da logiche di business SeND
 - **Referente tecnico**: ff / vr

##### pn-PaperNotificationFailed 

 - **Microservizio**: pn-delivery-push
 - **Descrizione funzionale**: associazione IUN delle notifiche per cui un destinatario è risultato irreperibile totale
 - **Referente tecnico**: sr / fl 

##### pn-PaperRequestDelivery 

 - **Microservizio**: pn-paper-channel
 - **Descrizione funzionale**: richieste ricevute da pn-paper-channel
 - **Referente tecnico**: ff / vr

##### pn-PaperRequestError 

 - **Microservizio**: pn-paper-channel
 - **Descrizione funzionale**: rifiuti tecnici delle spedizioni cartacee (pdf non stampabili, smarrimenti e deterioramenti )
 - **Referente tecnico**: ff / vr + fd / vv (per il meccanismo di redrive)

##### pn-PaperTender 

 - **Microservizio**: pn-paper-channel
 - **Descrizione funzionale**: tabella delle gare d'appalto
 - **Referente tecnico**: ff / vr

##### pn-PaperZone 

 - **Microservizio**: pn-paper-channel
 - **Descrizione funzionale**: elenco degli stati per ogni zona di consegna estera
 - **Referente tecnico**: ff / vr

##### pn-PnActivityReport 

 - **Microservizio**: pn-usage-estimates
 - **Descrizione funzionale**: tutto il microservizio è in standby
 - **Referente tecnico**: ff / mv

##### pn-PnDeliveryPushShedLock 

 - **Microservizio**: pn-delivery-push
 - **Descrizione funzionale**: persistenza per lock distibuito
 - **Referente tecnico**: sr / fl

##### pn-PnEstimate 

 - **Microservizio**: pn-usage-estimates
 - **Descrizione funzionale**: tutto il microservizio è in standby
 - **Referente tecnico**: ff / mv 

##### pn-PnProfilation 

 - **Microservizio**: pn-usage-estimates
 - **Descrizione funzionale**: tutto il microservizio è in standby
 - **Referente tecnico**: ff / mv

##### pn-PnServiceDeskAddress 

 - **Microservizio**: // TODO 
 - **Descrizione funzionale**: // TODO 
 - **Referente tecnico**: // TODO 

##### pn-PnServiceDeskClient 

 - **Microservizio**: pn-service-desk
 - **Descrizione funzionale**: elenco microservizi che possono invocare il microservizio pn-service-desk
 - **Referente tecnico**: vr

##### pn-PnServiceDeskOperationFileKey 

 - **Microservizio**: pn-service-desk
 - **Descrizione funzionale**: elenco file video caricati dal "call senter evoluto"
 - **Referente tecnico**: vr

##### pn-PnServiceDeskOperations 

 - **Microservizio**: pn-service-desk
 - **Descrizione funzionale**: elenco operazioni di "call center evoluto o non evoluto"
 - **Referente tecnico**: vr

##### pn-ProgressionSensorData 

 - **Microservizio**: pn-progression-sendor
 - **Descrizione funzionale**: attività in corso da parte di SeND e violazioni (attività avvenute in un tempo superiore alle SLA)
 - **Referente tecnico**: mi / mv

##### pn-Timelines 

 - **Microservizio**: pn-delivery-push
 - **Descrizione funzionale**: la timeline delle notifiche
 - **Referente tecnico**: sr / fl

##### pn-TimelinesCounters 

 - **Microservizio**: pn-delivery-push
 - **Descrizione funzionale**: contatori dei retry digitali fatti da pn-delivery-push
 - **Referente tecnico**: sr / fl

##### pn-TimelinesForInvoicing 

 - **Microservizio**: pn-progression-sensor
 - **Descrizione funzionale**: righe di timeline fatturabili
 - **Referente tecnico**: mi / mv

##### pn-UserAttributes 

 - **Microservizio**: pn-user-attrivutes
 - **Descrizione funzionale**: recapiti e domicili digitali di un utente
 - **Referente tecnico**: vr / mt

##### pn-VerificationCode2 

 - **Microservizio**: mock pn-ec
 - **Descrizione funzionale**: esiste anche nell'altro 
 - **Referente tecnico**: vr

##### pn-WebhookEvents 

 - **Microservizio**: pn-delivery-push
 - **Descrizione funzionale**: eventi degli "stream" degli eventi di timeline da inviare alle PA
 - **Referente tecnico**: sr / fl

##### pn-WebhookStreams 

 - **Microservizio**: pn-delivery-push
 - **Descrizione funzionale**: stream di eventi da inviare alle PA
 - **Referente tecnico**: sr / fl

##### pn-address-manager-apikey 

 - **Microservizio**: pn-address-manager
 - **Descrizione funzionale**: elenco client che possono invocare pn-address-manager
 - **Referente tecnico**: ff / mi

##### pn-address-manager-batch-request 

 - **Microservizio**: pn-address-manager
 - **Descrizione funzionale**: raggruppamenti di richieste fatte al validatore degli indirizzi
 - **Referente tecnico**: ff / mi 

##### pn-address-manager-cap 

 - **Microservizio**: pn-address-manager
 - **Descrizione funzionale**: elenco cap supportati da SeND
 - **Referente tecnico**: ff / mi 

##### pn-address-manager-country 

 - **Microservizio**: pn-address-manager
 - **Descrizione funzionale**: elenco cap supportati da address manager
 - **Referente tecnico**: ff / mi 

##### pn-address-manager-postel-batch 

 - **Microservizio**: pn-address-manager
 - **Descrizione funzionale**: raggruppamenti di richieste fatte al validatore degli indirizzi; risposte da postel
 - **Referente tecnico**: ff / mi 

##### pn-aggregates 

 - **Microservizio**: pn-apikey-manager
 - **Descrizione funzionale**: aggregazioni di enti che condividono lo stesso throttling
 - **Referente tecnico**: mv / ntt

##### pn-apiKey 

 - **Microservizio**: pn-apikey-manager
 - **Descrizione funzionale**: api key degli enti
 - **Referente tecnico**: mv / ntt

##### pn-batchPolling 

 - **Microservizio**: pn-national-registries
 - **Descrizione funzionale**: dati di polling verso IniPec
 - **Referente tecnico**: mv / ff 

##### pn-batchRequests 

 - **Microservizio**: pn-national-registries
 - **Descrizione funzionale**: raggruppamenti richieste nei confronti di IniPEC
 - **Referente tecnico**: mv / ff

##### pn-counter 

 - **Microservizio**: pn-national-registires
 - **Descrizione funzionale**: contatore delle richieste fatte a IniPEC .... vogliono un contatore monotono crescente
 - **Referente tecnico**: mv / ff

##### pn-document-ready 

 - **Microservizio**: pn-fsu-bff
 - **Descrizione funzionale**: microservizio in standby
 - **Referente tecnico**: ntt

##### pn-operations-iuns 

 - **Microservizio**: pn-radd-fsu
 - **Descrizione funzionale**: microservizio in standby
 - **Referente tecnico**: mv / vr

##### pn-paAggregations 

 - **Microservizio**: pn-apikey-manager
 - **Descrizione funzionale**: tabella di aggregazione tra enti e aggregazioni di enti
 - **Referente tecnico**: mv / ntt

##### pn-radd-transaction 

 - **Microservizio**: pn-radd-fsu
 - **Descrizione funzionale**: microservizio in standby
 - **Referente tecnico**: mv / vr
