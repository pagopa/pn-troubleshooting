const AwsClientsWrapper = require("../pn-common/libs/AwsClientWrapper")

const accountType = "confinfo"
const env = "hotfix"

const bucket = "pn-safestorage-eu-south-1-839620963891"

// go-153-test-delete-marker.txt

// ---------------------------------
// DYNAMODB
// documentKey: PN_NOTIFICATION_ATTACHMENTS-75018000ac6849ea8197da3081d5efef.pdf
// documentLogicalState: ATTACHED
// documentState: deleted

//S3
// originariamente aveva delete marker con versionId 'dMf3sMsyTYDjyBj740wU7SR16coOgiJ7'
// const fk = "PN_NOTIFICATION_ATTACHMENTS-75018000ac6849ea8197da3081d5efef.pdf" 

/*
1. Recupero iun in refinement da timeline;
2. uso lo iun come pk nella tabella pn-notification per recuperare la fk dell'allegato
3. uso la fk come pk nelle tabella pn-ssDocumenti per verificare lo stato del documento
 */


// Nessun Evento in pn-futureAction, delete marker attivo, documentState in pn-SsDocumenti: deleted
const iun = 'AZHM-KDKH-VPNP-202312-U-1'
const fk = "PN_NOTIFICATION_ATTACHMENTS-1518c389a3b741d196b3670a1520b171.pdf"

// Evento in pn-futureAction con type=check_attachment_retention, no delete marker, documentState in pn-SsDocumenti: attached
const iun2 = 'KNDA-NPAG-VANA-202502-J-1'
const fk2 = 'PN_NOTIFICATION_ATTACHMENTS-d14e8cd72feb4737a9deca0a4d9960f6.pdf'

// ----------------------------------------------

async function main() {

    async function _removeS3DeleteMarker(bucket, fkey) {

        awsClientConfinfo._initS3()

        const { DeleteMarkers } = await awsClientConfinfo._listObjectVersions(bucket, fkey);
        let LatestDeleteMarkers = DeleteMarkers?.filter((el) => el.IsLatest == true)[0]

        let outputObj = {}
        if (LatestDeleteMarkers) {
            const { $metadata: { httpStatusCode } } = await awsClientConfinfo._deleteObject(bucket, fkey, LatestDeleteMarkers.VersionId)
            outputObj = {
                key: fk.key,
                hasDeleteMarker: true,
                versionId: LatestDeleteMarkers.VersionId,
                deleteMarkerRemoved: httpStatusCode.toString().match(/2[0-9]{2}/) ? true : false,
                httpStatusCode: httpStatusCode
            }
        }
        else {
            outputObj = {
                key: fk.key,
                hasDeleteMarker: false,
                deleteMarkerRemoved: false
            }
        }

        console.log(outputObj)
    }

    async function _setDocumentStateAttached(fkey) {

        awsClientConfinfo._initDynamoDB()

        const tableName = "pn-SsDocumenti"
        const keys = { documentKey: fkey }
        const values = {
            documentState: {
                codeAttr: '#documentState',
                codeValue: ':newdocumentState',
                value: 'attached' // 'deleted'
            }
        }
        const { $metadata: { httpStatusCode } } = await awsClientConfinfo._updateItem(tableName, keys, values, 'SET')
        return httpStatusCode
    }

    async function _getItemFromPnFutureAction(iunValue) {

        awsClientCore._initDynamoDB()

        const tableName = "pn-FutureAction"
        return await awsClientCore._queryRequestByIndex(tableName, 'iun-index', 'iun', iunValue)
    }

    async function _setLogicalDeletedInPnFutureAction(timeSlotvalue, actionIdValue) {

        awsClientCore._initDynamoDB()

        const tableName = "pn-FutureAction"
        const keys = {
            timeSlot: timeSlotvalue,
            actionId: actionIdValue
        }
        const values = {
            logicalDeleted: {
                codeAttr: '#logicalDeleted',
                codeValue: ':newlogicalDeleted',
                value: true
            },
            type: {
                codeAttr: '#type',
                codeValue: ':codeValue',
                value: 5,
                condCodeValue: ':condCodeValue',
                condValue: 10
            }
        }
        try {
            const result = await awsClientCore._updateItem(
                tableName, keys, values, 'SET', '#type > :condCodeValue'
            )
            return result
        }
        catch (e) {
            switch (e.name) {
                case 'ConditionalCheckFailedException':
                    console.log("'type' attribute not equal to \'" + values.type.value + "\'. Skipped")
                    break
                default:
                    console.log(e)
                    process.exit(1)
            }
        }
    }

    function _printMsgIntoFile(iunV) {

        // ttl serve a far si che le righe non vengano eleminate dal database

        // notbefore = now() = timeSlot = momento in cui partirà l'azione.
        // Se parte azione è notifica != perfezionata allora
	    //     nuova azione CHECK_ATTACHMENT_RETENTION
		//         notBefore = notBefore + 110 -->> se notBefore > now -> azione in pn-FutureAction altrimenti in coda SQS pn-delivery-push-action
	    //     retention file = now + 120gg

        const nowSec = Math.floor(Date.now() / 1000) // ok
        const yearInSec = (60 * 60 * 24 * 365) // il 2028 è bisestile -> un giorno in meno nel risultato
        const notBeforeV = new Date().toISOString().replace(/Z$/,'000000Z'); // 2025-04-05T08:29:17.005269680Z
        const timeSlotV = notBeforeV.replace(/:\d{2}\.\d+Z$/,'')
        const actionIdV = "check_attachment_retention_iun_" + iunV + "_scheduling-date_" + notBeforeV

        const sqsMsg = {
            Body: {
                iun: iunV,
                notBefore: notBeforeV, // 2025-04-05T08:29:17.005269680Z
                ttl: nowSec + (yearInSec * 3), // occhio agli anni bisestili!
                type: "CHECK_ATTACHMENT_RETENTION",
                actionId: actionIdV,
                timeslot: timeSlotV // 2025-04-05T08:29
            },
            MessageAttributes: {
                createdAt: {
                    DataType: "String",
                    StringValue:  new Date().toISOString()
                },
                eventId: {
                    DataType: "String",
                    StringValue: "ad538d32-d36e-4db4-8862-9abf08c7a502" // X??? lib cripto
                },
                eventType: {
                    DataType: "String",
                    StringValue: "ACTION_GENERIC"
                },
                iun: {
                    DataType: "String",
                    StringValue: iunV
                },
                publisher: {
                    DataType: "String",
                    StringValue: "deliveryPush"
                }
            }
        }
    }

    // -------------------------------------------

    
    console.log(' -> Login with AWS "confinfo" account')
    const awsClientConfinfo = new AwsClientsWrapper('confinfo', env)

    console.log(' -> Login with AWS "core" account')
    const awsClientCore = new AwsClientsWrapper('core', env)

    // await _removeS3DeleteMarker(bucket, fk)

    // await _setDocumentStateAttached(fk)

    const result = await _getItemFromPnFutureAction(iun2)

    if (result.Count !== 0) {
        for (const item of result.Items) {

            // NON POSSO AGGIORNARE LA TABELLA TRAMITE GSI

            const pk = item.timeSlot.S // 2025-06-10T21:06
            const sk = item.actionId.S // check_attachment_retention_iun_KNDA-NPAG-VANA-202502-J-1_scheduling-date_2025-06-10T21:06:01.182068834Z

            const updatedItem = await _setLogicalDeletedInPnFutureAction(pk, sk)
            console.log(updatedItem)
        }
    }

    _printMsgIntoFile()
}

main()

