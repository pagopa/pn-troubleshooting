const { parseArgs } = require('util');
const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const fs = require('fs');
const { parse } = require('csv-parse');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const path = require('path');
const { ApiClient } = require("./libs/api");

function resolveDate(dateInMs, hasRefined) {
  let date = new Date(dateInMs)
  if(hasRefined) {
    date.setHours(date.getHours() + (24*121))
  }
  else {
    date.setHours(date.getHours() + (24*120))
  }
  return date.toISOString().substring(0, 19) + "Z"
}

function _parseCSV(fileName) {
  return new Promise((resolve, reject) => {
    let results = [];
    const parser = fs.createReadStream(fileName).pipe(parse({
      columns: true, 
      delimiter: ';', 
      trim: true
    }));
    parser.on('data', (data) => {
      results.push(data)
    });
    parser.on('error', (err) => {
      reject(err);
    });
    parser.on('end', () => {
      resolve(results);
    });
  })
}

async function removeDeletionMarkerIfNeeded(fileKey, bucketName){
  
  const isFileAvailable = await isFileAvailableInS3(bucketName, fileKey)
  if(!isFileAvailable){
    await removeDeletionMarker(fileKey, bucketName)
    if(!dryrun) {
      await awsClient._updateItem('pn-SsDocumenti', 'documentKey', fileKey, 'set documentState = :documentState', { ':documentState': { 'S': 'attached' } }, 'confinfo')
    }
    else {
      console.log("await awsClient._updateItem('pn-SsDocumenti', 'documentKey', " + fileKey + ", + 'set documentState = :documentState', { ':documentState': { 'S': 'attached' } }, 'confinfo')")
    }
    return {
      fileKey: fileKey,
      deletionMarkerRemoved: true,
      documentState: true
    }
  }
  else {
    const attachmentStatus = unmarshall((await awsClient._queryRequest("pn-SsDocumenti", 'documentKey', fileKey, 'documentState', 'confinfo')).Items[0]);
    if(!dryrun && attachmentStatus.documentState == 'deleted') {
      await awsClient._updateItem('pn-SsDocumenti', 'documentKey', fileKey, 'set documentState = :documentState', { ':documentState': { 'S': 'attached' } }, 'confinfo')
      return {
        fileKey: fileKey,
        deletionMarkerRemoved: false,
        documentState: true
      }
    }
    return {
      fileKey: fileKey,
      deletionMarkerRemoved: false,
      documentState: false
    }
  }
}

async function isFileAvailableInS3(bucketName, fileKey){
  try {
    await awsClient._checkS3Exists(bucketName, fileKey)
    return true
  } catch(err){
    if(err.name == 'NotFound'){
      return false
    } else {
      throw err
    }
  }
}

async function removeDeletionMarker(fileKey, bucketName){
  const version = await awsClient._getDeletionMarkerVersion(bucketName, fileKey)
  if(!version){
      throw new Error("Deletion marker not found for file " + fileKey)
  }
  if(!dryrun) {
    await awsClient._removeDeletionMarker(bucketName, fileKey, version)
  }
  else {
    console.log("await awsClient._removeDeletionMarker( " + bucketName + ", " + fileKey + ", " + version + ")")
  }
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> --dryrun"
  //CHECKING PARAMETER
  args.forEach(el => {
    if(el.mandatory && !values.values[el.name]){
      console.log("Param " + el.name + " is not defined")
      console.log(usage)
      process.exit(1)
    }
  })
  args.filter(el=> {
    return el.subcommand.length > 0
  }).forEach(el => {
    if(values.values[el.name]) {
      el.subcommand.forEach(val => {
        if (!values.values[val]) {
          console.log("SubParam " + val + " is not defined")
          console.log(usage)
          process.exit(1)
        }
      })
    }
  })
}

function appendJsonToFile(resultPath, fileName, jsonData){
  if(!fs.existsSync(resultPath))
    fs.mkdirSync(resultPath, { recursive: true });
  fs.appendFileSync(resultPath + "/" + fileName, JSON.stringify(jsonData) + "\n")
}

async function main() {
  const resultPath = path.join(__dirname, "files");
  const listBuckets = await awsClient._getBucketLists();
  const bucketName = listBuckets.Buckets.filter((x) => x.Name.indexOf("safestorage")>0 && x.Name.indexOf("staging")<0)[0].Name;
  const folder = fileName.split(".")[0]
  const results = await _parseCSV(fileName)
  /*const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  var results = []
  for(let idx = 0; idx < fileRows.length; idx++) {
    if(fileRows[idx]!='') {
      results.push(JSON.parse(fileRows[idx]))
    }
  }*/
  for (i = 0; i < results.length; i++) {
    let iun = results[i].iun
    //RETRIEVE ATTACHMENTS START
    console.log(iun)
    const attachments = unmarshall((await awsClient._queryRequest("pn-Notifications", 'iun', iun, 'documents,recipients,idempotenceToken,paNotificationId,senderPaId', 'core')).Items[0]);
    results[i]['attachments'] = []
    for(const doc of attachments.documents) {
      results[i].attachments.push(doc.ref.key)
    }
    for(const recipient of attachments.recipients) { 
      if(recipient.payments != null) {
        for(const payment of recipient.payments) {
          payment.pagoPaForm ? results[i].attachments.push(payment.pagoPaForm.ref.key) : null
        }
      }
    }
    results[i]['idempotenceToken'] = attachments.idempotenceToken
    results[i]['paProtocolNumber'] = attachments.paNotificationId
    results[i]['senderPaId'] = attachments.senderPaId
    //RETRIEVE ATTACHMENTS END
    //REMOVE DELETE MARKER START
    for(let j=0; j<results[i].attachments.length; j++){
      let safeStorageFlag = true
      const fileKey = results[i].attachments[j]
      try{
        const delMarkerRes = await removeDeletionMarkerIfNeeded(fileKey, bucketName)
        appendJsonToFile(resultPath + "/" + folder, "logs.json", delMarkerRes)
      } catch(err){
        safeStorageFlag = false;
        if(err.message.indexOf('Deletion marker not found ')===0){
          appendJsonToFile(resultPath + "/" + folder, "logs.json", {
            fileKey: fileKey,
            deletionMarkerRemoved: false,
            error: err.message
          })
        } else {
          console.log('Error on file ' + fileKey)
          throw err; // let it fail, we need to resume from that
        }
      }
      //REQUEST TO PN-SS START
      let newRetentionDate;
      if(results[i].status == "refined") {
        newRetentionDate = resolveDate(new Date(results[i].refinement_or_viewed_ts).getTime(), true)
      }
      else {
        newRetentionDate = resolveDate(new Date(), false)
      }
      if(!dryrun && safeStorageFlag) {
        try {
          if(newRetentionDate > new Date().toISOString) {
            const res = await ApiClient.requestToSafeStorage(fileKey, {
              "status": null,
              "retentionUntil": newRetentionDate
            });
            console.log("update to new retention " + iun + " on file " + fileKey + " to " + newRetentionDate, res.resultDescription)
          }
          else {
            console.log("new retention date " + newRetentionDate + " is not valid for " + iun + " file " + fileKey)
          }
        }
        catch (error) {
          console.log("problem to update retention " + iun + " file " + fileKey, error)
        }
      }
      else {
        safeStorageFlag ? console.log("DRYRUN: Request to safestorage iun " + iun + " with newRetentionDate: " + newRetentionDate) : console.log("IUN " + iun + " not sent safestorageflag " + safeStorageFlag)
      }
      //REQUEST TO PN-SS END
    }
    //REMOVE DELETE MARKER END
  }
}

const args = [
  { name: "envName", mandatory: true, subcommand: [] },
  { name: "fileName", mandatory: true, subcommand: [] },
  { name: "dryrun", mandatory: false, subcommand: [] },
]
const values = {
  values: { envName, fileName, dryrun},
} = parseArgs({
  options: {
    envName: {
      type: "string", short: "p", default: undefined
    },
    fileName: {
      type: "string", short: "t", default: undefined
    },
    dryrun: {
      type: "boolean", short: "d", default: false
    }
  },
});  

_checkingParameters(args, values)
const awsClient = new AwsClientsWrapper( envName );

main();