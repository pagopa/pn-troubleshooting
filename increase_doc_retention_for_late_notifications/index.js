const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');

function _checkingParameters(args, values){
  const usage = "Usage: index.js --envName <envName> --directory <directory> [--delayOffset <delayOffset>] [--scheduleAction]"
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

function appendJsonToFile(fileName, jsonData){
  if(!fs.existsSync(path.join(__dirname, "files")))
    fs.mkdirSync(path.join(__dirname, "files"), { recursive: true });
  fs.appendFileSync(fileName, JSON.stringify(jsonData) + "\n")
}

const args = [
  { name: "envName", mandatory: true, subcommand: [] },
  { name: "directory", mandatory: true, subcommand: [] },
  { name: "delayOffset", mandatory: false, subcommand: [] },
  { name: "scheduleAction", mandatory: false, subcommand: [] },
]
const values = {
  values: { envName, directory, delayOffset, scheduleAction },
} = parseArgs({
  options: {
    envName: {
      type: "string", short: "e", default: undefined
    },
    directory: {
      type: "string", short: "d", default: undefined
    },
    delayOffset: {
      type: "string", short: "o", default: "30"
    },
    scheduleAction: {
      type: "boolean", short: "s", default: false
    },
  },
});  

_checkingParameters(args, values)

const awsClient = new AwsClientsWrapper( envName );

let rowsNumber = 0
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

  await awsClient._removeDeletionMarker(bucketName, fileKey, version)
}


async function removeDeletionMarkerIfNeeded(fileKey, bucketName){
  
  const isFileAvailable = await isFileAvailableInS3(bucketName, fileKey)
  if(!isFileAvailable){
    await removeDeletionMarker(fileKey, bucketName)
    await awsClient._updateItem('pn-SsDocumenti', 'documentKey', fileKey, 'set documentState = :documentState', { ':documentState': { 'S': 'attached' } }, 'confinfo')

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

/**
 * 
pn-FutureAction
{
  "timeSlot": {
    "S": "2024-04-01T17:28"
  },
  "actionId": {
    "S": "check_attachment_retention_iun_YQHQ-KTKM-ZJTY-202312-U-1_scheduling-date_2024-04-01T17:28:41.553049305Z"
  },
  "iun": {
    "S": "YQHQ-KTKM-ZJTY-202312-U-1"
  },
  "notBefore": {
    "S": "2024-04-01T17:28:41.553049305Z"
  },
  "type": {
    "S": "CHECK_ATTACHMENT_RETENTION"
  }
}

pn-Action
{
  "actionId": {
    "S": "check_attachment_retention_iun_YQHQ-KTKM-ZJTY-202312-U-1_scheduling-date_2024-04-01T17:28:41.553049305Z"
  },
  "iun": {
    "S": "YQHQ-KTKM-ZJTY-202312-U-1"
  },
  "notBefore": {
    "S": "2024-04-01T17:28:41.553049305Z"
  },
  "timeslot": {
    "S": "2024-04-01T17:28"
  },
  "ttl": {
    "N": "1734024521"
  },
  "type": {
    "S": "CHECK_ATTACHMENT_RETENTION"
  }
}
*/
async function scheduleActions(iun, lineNumber){
  // not before is the current date pluse 30 minutes
  const delayInMilliseconds = parseInt(delayOffset)*60*1000+(lineNumber*5)*1000
  const notBefore = new Date(new Date().getTime() + delayInMilliseconds).toISOString()
  const timeSlot = notBefore.substring(0, 16)
  // epoch timestamp 365 days from now
  const ttl = Math.floor(new Date(new Date().setFullYear(new Date().getFullYear() + 1)).getTime() / 1000) 
  const action = {
    actionId: "check_attachment_retention_iun_" + iun + "_scheduling-date_" + notBefore,
    iun: iun,
    notBefore: notBefore,
    type: "CHECK_ATTACHMENT_RETENTION",
    timeSlot: timeSlot,
    ttl: ttl
  }
  const futureAction = {
    actionId: "check_attachment_retention_iun_" + iun + "_scheduling-date_" + notBefore,
    iun: iun,
    notBefore: notBefore,
    type: "CHECK_ATTACHMENT_RETENTION",
    timeSlot: timeSlot
  }
  await awsClient._createFutureActions(
    futureAction,
    action
  )
}

async function processSingleFile(file){
  // the file is a \n separated json objects
  const resultPath = path.join(__dirname, "files/log.json");
  const fileContent = fs.readFileSync(file)
  const lines = fileContent.toString().split("\n")
  const listBuckets = await awsClient._getBucketLists();
  const bucketName = listBuckets.Buckets.filter((x) => x.Name.indexOf("safestorage")>0 && x.Name.indexOf("staging")<0)[0].Name;
  for(let i = 0; i < lines.length; i++){
    const line = lines[i]
    if(line.length > 0){
      const json = JSON.parse(line)
      for(let j=0; j<json.attachments.length; j++){
        const fileKey = json.attachments[j]
        const iun = json.iun
        try{
          const delMarkerRes = await removeDeletionMarkerIfNeeded(fileKey, bucketName)
          delMarkerRes['iun'] = iun;
          appendJsonToFile(resultPath, delMarkerRes)
        } catch(err){
          if(err.message.indexOf('Deletion marker not found ')===0){
            appendJsonToFile(resultPath, {
              iun: json.iun,
              fileKey: fileKey,
              deletionMarkerRemoved: false,
              error: err.message
            })
          } else {
            console.log('Error on file ' + fileKey)
            throw err; // let it fail, we need to resume from that
          }
        }
      }
      if(scheduleAction){
        await scheduleActions(json.iun, rowsNumber++)
        appendJsonToFile(resultPath, {
          iun: json.iun,
          scheduledAction: true
        })
      }
    }
  }

}

async function main() {

  const files = fs.readdirSync(directory)
  const jsonFiles = files.filter(el => {
    return el.endsWith(".json")
  })

  for(let i = 0; i < jsonFiles.length; i++){
    const file = jsonFiles[i]
    await processSingleFile(directory+'/'+file)
  }
}

main();