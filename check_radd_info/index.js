const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const path = require('path');
const stream = require('stream');

function saveResponse(sourceStream, outputPath) {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(outputPath);
      writeStream.on('error', (error) => {
          reject(error);
      });
      writeStream.on('finish', () => {
          resolve();
      });
      sourceStream.pipe(writeStream);
      sourceStream.on('error', (error) => {
          writeStream.end();
          reject(error);
      });
  });
}

async function _writeInFile(path, result) {
  const resultPath = path + 'dynamoresult.json';
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 4), 'utf-8')
}

function _checkingParameters(args, values){
  const usage = "Usage index.js --envName <envName> --cf <fiscalcode> --operationId <operation-id>"
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
    { name: "cf", mandatory: true, subcommand: [] },
    { name: "operationId", mandatory: false, subcommand: [] }
  ]
  const values = {
    values: { envName, cf, operationId },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      cf: {
        type: "string", short: "f", default: undefined
      },
      operationId: {
        type: "string", short: "d", default: undefined
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  const resultPath = path.join(__dirname, "results/" + envName + "_" + new Date().toISOString() + "/");
  const transactionId = 'RADD#' + cf + '#' + operationId
  const listBuckets = await awsClient._getBucketLists();
  const bucketName = listBuckets.Buckets.filter((x) => x.Name.indexOf("safestorage")>0 && x.Name.indexOf("staging")<0)[0].Name;
  const result = await awsClient._queryRequest("pn-radd-transaction-alt", 'transactionId', transactionId);
  for(let i = 0; i < result.Items.length; i++) {
    let tmp = unmarshall(result.Items[i]);
    const getObjectRes = await awsClient._getObject(bucketName, tmp.fileKey)
    fs.mkdirSync(resultPath, { recursive: true });
    _writeInFile(resultPath, tmp)
    if (getObjectRes.Body instanceof stream.Readable) {
      const outputPath = resultPath + tmp.fileKey; 
      saveResponse(getObjectRes.Body, outputPath)
          .then(() => {
              console.log('File scritto con successo!');
          })
          .catch((error) => {
              console.error('Errore durante la scrittura del file:', error);
          });
    } else {
        throw new Error('Expected body to be a readable stream');
    }
  }
  
}

main();