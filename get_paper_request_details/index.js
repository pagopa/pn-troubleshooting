/**
 * Avere possibilità di leggere pn-PaperRequestError
 * Dato un requestId .... ad esempio PREPARE_ANALOG_DOMICILE.IUN_MTHT-KHVH-ADPK-202307-P-1.RECINDEX_0.ATTEMPT_0.   leggere le entry corrispondent delle tabelle:
 * pn-PaperRequestError
 * pn-PaperRequestDelivery
 * pn-PaperAddress.  (quello veramente interessante è il RECEIVER_ADDRESS )
 * pn-EcRichieste.    in cui l'id va calcolato secondo la regola     "pn-cons-000~" + requestId + ".PCRETRY_" + n con n appartenente a [0 .... 10]
 * pn-EcRichiesteMetadati.    in cui l'id va calcolato secondo la regola     "pn-cons-000~" + requestId + ".PCRETRY_" + n con n appartenente a [0 .... 10]
 * pn-PaperEvents:   due query una con pk = "META##" + requestId.    l'altra con pk = "DEMAT##"
 * Raccolti i dati vanno decodificati gli indirizzi contenuti nella pn-PaperAddress  utilizzando la chiave simmetrica KMS definita in storage.yml di pn-paper-channe
*/
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { GetCommand, QueryCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const { marshall } = require("@aws-sdk/util-dynamodb");
const { parseArgs } = require('util');
const fs = require('fs')

const args = ["awsCoreProfile", "awsConfinfoProfile", "requestId"]
const values = {
  values: { awsCoreProfile, awsConfinfoProfile, requestId },
} = parseArgs({
  options: {
    awsCoreProfile: {
      type: "string",
      short: "a"
    },
    awsConfinfoProfile: {
      type: "string",
      short: "b"
    },
    requestId: {
        type: "string",
        short: "i"
    },
    format: {
        type: "string",
        short: "f"
    }    
  },
});

args.forEach(k => {
    if(!values.values[k]) {
      console.log("Parameter '" + k + "' is not defined")
      console.log("Usage: node index.js --awsCoreProfile <aws-core-profile> --awsConfinfoProfile <aws-confinfo-profile> --requestId <request-id> --format <format>")
      process.exit(1)
    }
  });

console.log("Using AWS Core profile: "+ awsCoreProfile)
console.log("Using AWS Confinfo profile: "+ awsConfinfoProfile)

const format = 'raw'

const coreCredentials = fromSSO({ profile: awsCoreProfile })();
const coreDynamoDbClient = new DynamoDBClient({
    credentials: coreCredentials,
    region: 'eu-south-1'
});
const coreDDocClient = DynamoDBDocumentClient.from(coreDynamoDbClient);

const confinfoCredentials = fromSSO({ profile: awsConfinfoProfile })();
const confinfoDynamoDbClient = new DynamoDBClient({
    credentials: confinfoCredentials,
    region: 'eu-south-1'
});
const confinfoDDocClient = DynamoDBDocumentClient.from(confinfoDynamoDbClient);

const tableAccountMapping = {
    'pn-PaperRequestError': 'core',
    'pn-PaperRequestDelivery': 'core',
    'pn-PaperAddress': 'core',
    'pn-PaperEvents': 'core',
    'pn-EcRichieste': 'confinfo',
    'pn-EcRichiesteMetadati': 'confinfo'
}

function getClientByTable(tableName){
    const account = tableAccountMapping[tableName]
    if(!account){
        throw new Error("Table not mapped "+tableName)
    }

    if(account==='core'){
        return coreDDocClient
    } 

    if(account==='confinfo'){
        return confinfoDDocClient
    }
}

async function getItemFromTable(tableName, keys, resultFormat){
    const client = getClientByTable(tableName)
    const params = {
        TableName: tableName,
        Key: keys
    };
    const ret = await client.send(new GetCommand(params));
    if(ret && ret.Item){
        if(resultFormat==='raw'){
            return marshall(ret.Item)
        }
        return ret.Item
    }

    return null
}

async function queryItemFromTable(tableName, keys, resultFormat){
    const client = getClientByTable(tableName)
    const expressionAttributes = {}
    Object.entries(keys).forEach((k) => {
        expressionAttributes[':'+k[0]] = k[1]
    })

    const params = {
        TableName: tableName,
        KeyConditionExpression: Object.entries(keys).map((k) => {
            return k[0]+' = :'+k[0]
        }).join(', '),
        ExpressionAttributeValues: expressionAttributes
    };

    const ret = await client.send(new QueryCommand(params));
    if(ret && ret.Items){
        return ret.Items.map((i) => {
            if(resultFormat==='raw'){
                return marshall(i)
            } 
            return i                
        })
    }

    return []
}

async function downloadRequestIdData(requestId){
    console.debug('starting '+requestId)
    const paperRequestError = await queryItemFromTable('pn-PaperRequestError', {
        requestId: requestId
    }, format)
    console.debug('paperRequestError '+requestId)

    const paperRequestDelivery = await getItemFromTable('pn-PaperRequestDelivery', {
        requestId: requestId
    }, format)
    console.debug('paperRequestDelivery '+requestId)
    
    const paperAddresses = await queryItemFromTable('pn-PaperAddress', {
        requestId: requestId
    }, format)
    console.debug('paperAddresses '+requestId)

    const pnEcRichiesteMetadati = []
    for(let i=0; i<10; i++){
        const ecRequestId = 'pn-cons-000~'+requestId+'.PCRETRY_'+i
        const richiesta = await getItemFromTable('pn-EcRichieste', {
            requestId: ecRequestId
        }, format)
        console.debug('EcRichieste '+ecRequestId)


        if(!richiesta){
            break
        }

        const metadata = await getItemFromTable('pn-EcRichiesteMetadati', {
            requestId: ecRequestId
        }, format)
        console.debug('EcRichiesteMetadati '+ecRequestId)

        const ecPayload = {
            richiesta: richiesta,
            metadata: metadata
        }        

        if(metadata){
            const meta = await queryItemFromTable('pn-PaperEvents', {
                pk: 'META##'+requestId+'.PCRETRY_'+i
            }, format)

            console.debug('PaperEvents Meta META##'+requestId+'.PCRETRY_'+i)

            const demat = await queryItemFromTable('pn-PaperEvents', {
                pk: 'DEMAT##'+requestId+'.PCRETRY_'+i
            }, format)

            console.debug('PaperEvents Meta DEMAT##'+requestId+'.PCRETRY_'+i)

            ecPayload.meta = meta
            ecPayload.demat = demat
        }

        pnEcRichiesteMetadati.push(ecPayload)
    }

    return {
        paperRequestError: paperRequestError,
        paperRequestDelivery: paperRequestDelivery,
        paperAddresses: paperAddresses,
        pnEcRichiesteMetadati: pnEcRichiesteMetadati
    }
}

function writeResults(data){
    const folder = 'details'

    const filePath = folder+'/'+requestId+'_'+new Date().toISOString()+'.json'
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4))

    return folder
}
downloadRequestIdData(requestId)
.then(function(data){
    writeResults(data)
})