const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

function isPNdeliveryDetailsCode(deliveryDetailCode) {
  return deliveryDetailCode === "PNAG012" || deliveryDetailCode === "PNRN012" 
}

function isRECdeliveryDetailsCode(deliveryDetailCode) {
  return deliveryDetailCode === "RECAG001C" || 
         deliveryDetailCode === "RECAG003C" ||
         deliveryDetailCode === "RECAG005C" ||
         deliveryDetailCode === "RECAG006C" ||
         deliveryDetailCode === "RECRN002C" 
}

function appendJsonToFile(fileName, data){
  const pathResult = path.join(__dirname, 'results');
  if(!fs.existsSync(pathResult))
    fs.mkdirSync(pathResult, { recursive: true });
  fs.appendFileSync(`${pathResult}/${fileName}`, data + "\n")
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
    { name: "fileName", mandatory: true, subcommand: [] }
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
      }
    },
  });  
  _checkingParameters(args, values)
  //Prepare AWS Core
  const awsCoreClient = new AwsClientsWrapper( 'core', envName );
  awsCoreClient._initDynamoDB()
  //Prepare AWS ConfInfo
  const awsConfinfoClient = new AwsClientsWrapper( 'confinfo', envName );
  awsConfinfoClient._initDynamoDB()
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n').filter(line=>line.trim()!='')
  for(let i = 0; i < fileRows.length; i++){
    let checkList = {
      refinement: false,
      feedback: false
    }
    const row = JSON.parse(fileRows[i])
    const body = JSON.parse(row.Body)
    const iun = body.iun
    console.log(`Handling message with iun ${iun}` )
    const results = await awsCoreClient._queryRequest("pn-Timelines", "iun", iun)
    if(results.Items.length > 0) { 
      //CHECK REFINEMENT AND SEND_ANALOG_FEEDBACK LIST
      const sendAnalogFeedbackList = results.Items.filter(e => {
        const tmp = unmarshall(e)
        tmp.category === "REFINEMENT" && body.recipientIndex == tmp.details.recIndex ? checkList.refinement = true : null
        return tmp.category === "SEND_ANALOG_FEEDBACK" && body.recipientIndex == tmp.details.recIndex
      })
      if(!checkList.refinement) {
        console.log(`Event with iun ${iun} to keep`)
        continue
      }
      //CHECK SEND_ANALOG_FEEDBACK
      const latestSAFeedback = unmarshall(sendAnalogFeedbackList.reduce((acc, current) => {
        if(acc.timelineElementId > current.timelineElementId) {
          return acc 
        } else {
          return current 
        }
      }));
      if(isPNdeliveryDetailsCode(latestSAFeedback.details.deliveryDetailCode)) {
        console.log(`Event with iun ${iun} to remove`)
        appendJsonToFile(`to_remove_PN_${path.basename(fileName)}`, JSON.stringify(row))
        checkList.feedback = true
      }
      else if(isRECdeliveryDetailsCode(latestSAFeedback.details.deliveryDetailCode)){
        console.log(`Event with iun ${iun} to remove`)
        appendJsonToFile(`to_remove_REC_${path.basename(fileName)}`, JSON.stringify(row))
      }
      else {
        console.log(`Event with iun ${iun} to keep`)
      }
    }
  }
}

main();