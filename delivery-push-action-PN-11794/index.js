const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

function checkListToRemove(checkList){
  let flag = true
  Object.keys(checkList).forEach(k => {
    if(!checkList[k]) 
      flag = false
  });
  return flag
}

function checkListToRemoveWithoutThirdStep(checkList){
  return checkList.refinement && checkList.feedback && !checkList.ecmetadati
}

function appendJsonToFile(fileName, data){
  if(!fs.existsSync("results"))
    fs.mkdirSync("results", { recursive: true });
  fs.appendFileSync(fileName, data + "\n")
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
      feedback: false,
      ecmetadati: false
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
      if(latestSAFeedback.details.deliveryDetailCode === "PNAG012") {
        checkList.feedback = true
      }
      else {
        console.log(`Event with iun ${iun} to keep`)
        continue
      }
      const requestId = `${latestSAFeedback.timelineElementId.replace("SEND_ANALOG_FEEDBACK", "PREPARE_ANALOG_DOMICILE")}` 
      //Prendere da EcRichiesteMetadati l’ultimo PCRetry e certificare la lista degli eventi contenga un RECAG008C
      let flag = true;
      let pcRetryIdx = 0;
      let latestMetadata;
      while(flag) {
        const tmpMetadataResult = await awsConfinfoClient._queryRequest("pn-EcRichiesteMetadati", "requestId", `pn-cons-000~${requestId}.PCRETRY_${pcRetryIdx}`)
        if(tmpMetadataResult.Items.length > 0) {
          latestMetadata = unmarshall(tmpMetadataResult.Items[0]);
          pcRetryIdx = pcRetryIdx + 1
        }
        else{
          flag = false;
        }
      }
      const found = latestMetadata.eventsList.find(event => {
        return event.paperProgrStatus.status === 'RECAG008C'
      });
      if(found) {
        checkList.ecmetadati = found
      }
      else {
        if(checkListToRemoveWithoutThirdStep(checkList)){
          console.log(`Event with iun ${iun} to remove third step`)
          appendJsonToFile(`no_third_step_to_remove_${fileName}`, JSON.stringify(row))
        } else {
          console.log(`Event with iun ${iun} to keep`)
          continue
        }
      }
      if(checkListToRemove(checkList)){
        delete row['Body']
        console.log(`Event with iun ${iun} to remove`)
        appendJsonToFile(`${fileName}_result.json`, JSON.stringify(row))
      }
    }
  }
}

main();