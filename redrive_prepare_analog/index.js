const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

function _checkingParameters(args, values){
  const usage = "Usage: index.js --envName <envName> --fileName <fileName>"
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

function _prepareMessage(requestId, event) {
  const message = {
    digitalCourtesy: null,
    digitalLegal: null,
    clientId: "pn-cons-000",
    eventTimestamp: new Date().toISOString(),
    analogMail: {
      requestId: requestId,
      registeredLetterCode: event.registeredLetterCode,
      productType: event.productType,
      iun: event.iun,
      statusCode: event.statusCode,
      statusDescription: event.statusDescription,
      statusDateTime: event.statusDateTime,
      deliveryFailureCause: event.deliveryFailureCause,
      attachments: event.attachments,
      discoveredAddress: event.discoveredAddress,
      clientRequestTimeStamp: event.clientRequestTimeStamp
    },
  }
  return message

}

async function _writeInFile(result) {
  fs.mkdirSync("result", { recursive: true });
  const dateIsoString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
  fs.writeFileSync('result/result.json', JSON.stringify(result, null, 4), 'utf-8')
}

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] }
  ]
  const values = {
    values: { envName, fileName, timing },
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
  const awsClient = new AwsClientsWrapper( envName );
  const requestIds = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n');
  let index = 0;
  for(const requestId of requestIds ) {
    index = index + 1;
    const delay = (index/10) * 2;
    const metadati = (await awsClient._queryRequest("pn-EcRichiesteMetadati", 'requestId', "pn-cons-000~" + requestId, 'eventsList')).Items[0];
    for(const e of unmarshall(metadati).eventsList ) {
      if(e.paperProgrStatus.statusCode == 'RECAG012') {
        
        const message = _prepareMessage(requestId, e.paperProgrStatus) //verificare se va bene 2024-01-25T14:30:48.228Z invece di 2024-01-18T11:37:15.157677598Z
        console.log(message)
        await awsClient._sendSQSMessage("pn-external_channel_to_paper_channel", message, delay)
      }
    }
  }
}

main();