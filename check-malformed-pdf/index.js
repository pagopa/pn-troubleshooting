const pdfUtil = require('pdf-to-text');
const fs = require('fs')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { QueryCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const cluster = require('cluster');
const os = require('os');



process.env.AWS_SDK_LOAD_CONFIG=1

const env = process.argv[2]
const ndjsonInputFilePath = process.argv[3]
const bucketName = process.argv[4]

const dateExecution = new Date().toISOString()
const confinfoProfile = 'sso_pn-confinfo-'+env
const coreProfile = 'sso_pn-core-'+env

const confinfoCredentials = fromSSO({ profile: confinfoProfile })();
const coreCredentials = fromSSO({ profile: coreProfile })();

// Configure AWS SDK with your credentials and region
const s3Client = new S3Client({
  region: 'eu-south-1', 
  credentials: confinfoCredentials
});

const coreDynamoDbClient = new DynamoDBClient({
    credentials: coreCredentials,
    region: 'eu-south-1'
});
const coreDocClient = DynamoDBDocumentClient.from(coreDynamoDbClient);

async function queryItemFromTable(tableName, keys){
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

    const ret = await coreDocClient.send(new QueryCommand(params));
    if(ret && ret.Items){
        return ret.Items
    }

    return []
}

function downloadS3File(fileKey, filePath){

    const getObjectParams = {
        Bucket: bucketName,
        Key: fileKey,
    };

    return new Promise((resolve, reject) => {
        const getObjectCommand = new GetObjectCommand(getObjectParams);
    
        s3Client
          .send(getObjectCommand)
          .then((data) => {
            const fileStream = fs.createWriteStream(filePath); // Replace with your desired file name
            data.Body.pipe(fileStream);
            fileStream.on('finish', () => {
              resolve('File downloaded successfully.');
            });
          })
          .catch((err) => {
            if(err.Code=='InvalidObjectState' || err.Code=='NoSuchKey'){
                resolve(null)
            } else {
                console.error('Error downloading file:', err);
                reject(err);
            }
          });
    });
}


function toText(pdfPath){
    return new Promise((resolve, reject) => {
        pdfUtil.pdfToText(pdfPath, function(err, data) {
            if (err) reject(err);
            resolve(data);
        });         
    })
}

async function countFeedbackElements(iun, recIndex){
    const items = await queryItemFromTable('pn-Timelines', {iun})

    // pattern is SEND_DIGITAL_FEEDBACK.(.*).REC_INDEX_{recIndex}

    const filteredItems = items.filter((item) => {
        return item.timelineElementId.indexOf('SEND_DIGITAL_FEEDBACK.')>=0 && item.timelineElementId.indexOf('.RECINDEX_'+recIndex)>=0
    })

    return filteredItems.length
}

async function checkSingleItem(item, folderName){
    const formattedFileKey = item.key.S.replace("safestorage://", "")

    console.log('Started IUN: '+item.iun.S+' - file key: '+formattedFileKey)

    const outputPath = folderName+'/'+formattedFileKey
    const res = await downloadS3File(formattedFileKey, outputPath)
    if(res==null){
        console.log('IUN '+item.iun.S+': file '+formattedFileKey+' is in GLACIER')
        return
    }
    const text = await toText(outputPath)
    const malformed = text.indexOf('Nome e Cognome') < 0
    if(malformed){
        console.log('IUN '+item.iun.S+': file key '+formattedFileKey+' is malformed; no occurrences of Nome e Cognome')
    } else {
        const feedbackElements = await countFeedbackElements(item.iun.S, item.recIndex.N)  
        // count occurrences of 'Nome e Cognome' in text
        const occurrences = text.split('Nome e Cognome').length - 1;
        if(occurrences != feedbackElements){
            console.log('IUN '+item.iun.S+': file key '+formattedFileKey+' is malformed, occurrences '+occurrences+' feedbackElements '+feedbackElements)
        } else {
            fs.unlinkSync(outputPath)
        }
    }

}

async function main(){
    const folderName = '/tmp/'+env+'-'+dateExecution
    fs.mkdirSync(folderName, { recursive: true })
    if (cluster.isMaster) {
        const numCPUs = os.cpus().length;
      
        console.log(`Numero di core disponibili: ${numCPUs}`);
      
        // Leggi il file e determina il numero di righe
        const fileContent = fs.readFileSync(ndjsonInputFilePath, 'utf8')
        const lines = fileContent.split('\n');
        const numLines = lines.length;
      
        console.log(`Numero totale di righe nel file: ${numLines}`);
      
        // Calcola il numero di righe per worker
        const linesPerWorker = Math.ceil(numLines / numCPUs);
      
        // Avvia un worker per ogni core e assegna le righe corrispondenti
        let startLine = 0;
        for (let i = 0; i < numCPUs; i++) {
          const endLine = Math.min(startLine + linesPerWorker, numLines);
          const worker = cluster.fork();
      
          // Invia al worker l'intervallo di righe da elaborare
          worker.send({ startLine, endLine });
      
          startLine = endLine;
        }
      
        // Gestisci l'evento di exit per i worker
        cluster.on('exit', (worker, code, signal) => {
          console.log(`Worker ${worker.process.pid} terminato con il codice ${code}`);
        });
      } else {
        // Codice del worker
        process.on('message', async (message) =>  {
          // Estrai l'intervallo di righe dal messaggio
          const { startLine, endLine } = message;
      
          // Leggi il file e processa le righe nell'intervallo
          const fileContent = fs.readFileSync(ndjsonInputFilePath, 'utf-8');
          const lines = fileContent.split('\n').slice(startLine, endLine);
          console.log("start: " + startLine + " end: " + endLine)
          for(const line of lines){
            const obj = JSON.parse(line)
            await checkSingleItem(obj, folderName)
          }
          // Termina il worker
          process.exit();
        });
      }
/*    fs.createReadStream(ndjsonInputFilePath)
        .pipe(ndjson.parse())
        .on('data', async function(obj) {
            await checkSingleItem(obj, folderName)
        })*/
}


main().then(() => console.log('done')).catch(err => console.log(err))