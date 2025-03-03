const { parseArgs } = require('util');
const fs = require('fs');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall, marshall } = require('@aws-sdk/util-dynamodb');
const { appendJsonToFile } = require('pn-common/libs/utils');

function normalizeResult(items) {
  const tmp = []
  for(const value of items) {
    tmp.push(unmarshall(value))
  }
  return tmp
}
function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name>"
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

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
  ]
  const values = {
    values: { envName, fileName },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      }, 
      fileName: {
        type: "string", short: "f", default: undefined
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( 'core', envName );
  awsClient._initDynamoDB()
  const now = new Date().toISOString()
  const iuns = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n').filter(x=>x!='')
  let i = 1;
  for(const iun of iuns) {
    console.log(`Searching for iun ${i}: ${iun}`)
    const result = await awsClient._queryRequest('pn-Notifications', 'iun', iun)
    if(result.Items.length > 0) {
      const data = unmarshall(result.Items[0])
      const recipients = []
      data.recipients.forEach(element => {
        recipients.push(element.recipientId)
      });
      for(const rec of recipients) {
        const result = await awsClient._queryRequest('pn-NotificationsMetadata', 'iun_recipientId', `${iun}##${rec}`)
        console.log(unmarshall(result.Items[0]).notificationStatus)
        if(result.Items.length > 0) {
          const data = {
            iun: iun,
            status: unmarshall(result.Items[0]).notificationStatus 
          }
          appendJsonToFile(`results/${envName}-${now}`, `statusNotification.json`, JSON.stringify(data))
        }
      }
    }
    i = i + 1;
  }
}

main();