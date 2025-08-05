const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

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

function appendJsonToFile(resultPath, fileName, jsonData){
  if(!fs.existsSync(resultPath))
    fs.mkdirSync(resultPath, { recursive: true });
  fs.appendFileSync(`${resultPath}/${fileName}`, jsonData + "\n")
}

async function retrieveAttachments(awsClient, iun, resultPath) {
  const attachments = (await awsClient._queryRequest("pn-Notifications", 'iun', iun, 'documents,recipients')).Items[0];
  const temp = {
    "iun": iun,
    "attachments": [],
  }
  for(const doc of unmarshall(attachments).documents) {
    temp.attachments.push(doc.ref.key)
  }
  
  for(const recipient of unmarshall(attachments).recipients) {
    
    if(recipient.payments != null) {
      for(const payment of recipient.payments) {
        payment.pagoPaForm ? temp.attachments.push(payment.pagoPaForm.ref.key) : null
      }
    }
      
  }
  
  appendJsonToFile(resultPath, "attachments.json", JSON.stringify(temp))
}

async function retrieveAARs(awsClient, iun, resultPath) {
  const result = await awsClient._queryRequest("pn-Timelines", 'iun', iun);
      if(result.Items.length > 0) {
        let aar_gens = result.Items.filter(x => {
          return x.category.S === "AAR_GENERATION"
        })
        aar_gens.forEach(e => {
          const unmarshalled = unmarshall(e)
          const legalFact = unmarshalled.details.generatedAarUrl.replace("safestorage://", "")
          appendJsonToFile(resultPath, "aar.json", `${iun},${legalFact}`)
        });
      }
}

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
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
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  const resultPath = path.join(__dirname, "results");
  const data = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n');
  for (iun of data) {
    if (iun === '')
      continue
    try {
      await retrieveAttachments(awsClient, iun, resultPath)
      await retrieveAARs(awsClient, iun, resultPath)
    }
    catch (e) {
      console.log(`Problem to retrieve iun ${iun}`, e)
    }
  }
}

main();