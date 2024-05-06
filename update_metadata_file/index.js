const { parseArgs } = require('util');
const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const fs = require('fs');
const { parse } = require('csv-parse');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const path = require('path');
const { ApiClient } = require("./libs/api");

function resolveDate(date, hasRefined) {
  if(hasRefined) {
    date.setHours(date.getHours() + 1)
  }
  else {
    date.setHours(date.getHours() + (24*120))
  }
  return date.toISOString().split('.')[0] + "Z"
}

function _parseCSV(fileName) {
  return new Promise((resolve, reject) => {
    let results = [];
    const parser = fs.createReadStream(fileName).pipe(parse({
      columns: true, 
      delimiter: ',', 
      trim: true
    }));
    parser.on('data', (data) => {
      results.push(data)
    });
    parser.on('error', (err) => {
      reject(error);
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
      deletionMarkerRemoved: true
    }
  }
  return {
    fileKey: fileKey,
    deletionMarkerRemoved: false
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
  const usage = "Usage: node index.js --awsProfile <aws-profile> --tableName <table-name> --filter <filter>"
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
  const results = await _parseCSV(fileName)
  const listBuckets = await awsClient._getBucketLists();
  const bucketName = listBuckets.Buckets.filter((x) => x.Name.indexOf("safestorage")>0 && x.Name.indexOf("staging")<0)[0].Name;
  
  for (i = 0; i < results.length; i++) {
    let iun = results[i].iun
    //RETRIEVE ATTACHMENTS START
    const attachments = (await awsClient._queryRequest("pn-Notifications", 'iun', iun, 'documents,recipients', 'core')).Items[0];
    results[i]['attachments'] = []
    for(const doc of unmarshall(attachments).documents) {
      results[i].attachments.push(doc.ref.key)
    }
    for(const recipient of unmarshall(attachments).recipients) { 
      if(recipient.payments != null) {
        for(const payment of recipient.payments) {
          payment.pagoPaForm ? results[i].attachments.push(payment.pagoPaForm.ref.key) : null
        }
      }
    }
    //RETRIEVE ATTACHMENTS END
    //REMOVE DELETE MARKER START
    for(let j=0; j<results[i].attachments.length; j++){
      const fileKey = results[i].attachments[j]
      try{
        const delMarkerRes = await removeDeletionMarkerIfNeeded(fileKey, bucketName)
        appendJsonToFile(resultPath, "logs.json", delMarkerRes)
      } catch(err){
        if(err.message.indexOf('Deletion marker not found ')===0){
          appendJsonToFile(resultPath, "logs.json", {
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
        const retentionUntil = (await awsClient._queryRequest("pn-SsDocumenti", 'documentKey', fileKey, 'retentionUntil', 'confinfo')).Items[0];
        newRetentionDate = resolveDate(new Date(unmarshall(retentionUntil).retentionUntil), true)
      }
      else {
        newRetentionDate = resolveDate(new Date(), false)
      }
      if(!dryrun) {
        await ApiClient.requestToSafeStorage(fileKey, {
          "status": null,
          "retentionUntil": newRetentionDate
        });
      }
      else {
        console.log("Request to safestorage: with newRetentionDate: " + newRetentionDate)
      }
      //REQUEST TO PN-SS END
    }
    //REMOVE DELETE MARKER END
  }
}

const args = [
  { name: "envName", mandatory: true, subcommand: [] },
  { name: "fileName", mandatory: true, subcommand: [] },
  { name: "dryrun", mandatory: true, subcommand: [] },
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