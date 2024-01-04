const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');


function _checkingParameters(args, values){
  const usage = "Usage: index.js --envName <envName> --bucketName <bucketName> --fileName <fileName> --expiration <--expiration>"
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

async function getDocumentsByIUN(awsClient, iun){
  const notification = await awsClient._getItem('pn-Notifications', 'iun', iun, 'core')

  const docKeys = notification.documents.map((el) => el.ref.key);
  const paymentKeys = notification.recipients.map((el) =>
    el.payments?.map((p) => p.pagoPaForm?.ref.key)
  ).flat(2).filter(el => el);

  return [docKeys, paymentKeys].flat(3);
}

function appendJsonToFile(fileName, jsonData){
  fs.appendFileSync(fileName, JSON.stringify(jsonData) + "\n")
}

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "bucketName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
    { name: "expiration", mandatory: false, subcommand: [] },
  ]
  const values = {
    values: { envName, bucketName, fileName, expiration},
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      bucketName: {
        type: "string", short: "b", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      },
      expiration: {
        type: "string", short: "t", default: "30"
      },
    },
  });  
  
  _checkingParameters(args, values)
  const days = parseInt(expiration)

  const awsClient = new AwsClientsWrapper( envName );

  const fileContent = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' });
  const rows = fileContent.split("\n")
  for(let i=1; i<rows.length; i++){
    const row = rows[i]
    const splitted = row.split(",")
    const iun = splitted[0].replace("\"", "").replace("\"", "")
    const sentAt = splitted[1].replace("\"", "").replace("\"", "")
    
    const threeMonthsAgo = new Date() - 1000*60*60*24*90
    // threeMonthsAgo in the form YYYY-MM-DD
    const threeMonthsAgoStr = new Date(threeMonthsAgo).toISOString().split('T')[0]
    if(sentAt<threeMonthsAgoStr){
      const docs = await getDocumentsByIUN(awsClient, iun)
      console.log('docs for iun '+iun, docs)
      for(let j=0; j<docs.length; j++){
        const doc = docs[j]
        try {
          const res = await awsClient._checkS3Exists(bucketName, doc)
          appendJsonToFile('files/s3.json', {
            iun: iun,
            file: doc,
            expiration: res.Expiration
          })
        } catch(e){
          console.log(e.name)
          if(e.name == 'NotFound'){
            appendJsonToFile('files/notFound.json', {
              iun: iun,
              file: doc
            })
          } else {
            console.log(e)
          }
        }
      }
    } else {
      console.log('skip '+iun+' because sent at '+sentAt)
    }
  }
}

main();