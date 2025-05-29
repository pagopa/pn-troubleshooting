const { parseArgs } = require('util');
const fs = require('fs');
const { AwsClientsWrapper } = require("pn-common");


function saveFileFromBuffer(sourceStream, outputPath) {
  
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

function _initFolder(values){
  values.forEach(value => {
    if(!fs.existsSync(value))
      fs.mkdirSync(value, { recursive: true });
  });
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
    { name: "microservices", mandatory: false, subcommand: [] },
  ]
  const values = {
    values: { envName, microservices },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      microservices: {
        type: "string", short: "e", default: undefined
      }
    },
  });  
  _checkingParameters(args, values)
  const accounts = ['core', 'confinfo']
  const outputFilesFolder = `backup/${envName}`
  const fileEnvName = "runtime-variable.env"
  const logging = [
    "LOGGING_LEVEL_IT_PAGOPA_PN=INFO",
    "LOGGING_LEVEL_ORG_SPRINGFRAMEWORK_CLOUD_FUNCTION_CONTEXT_CONFIG=ERROR"
  ]
  _initFolder([outputFilesFolder])
  for (const account of accounts) {
    const awsClient = new AwsClientsWrapper( account, envName );
    awsClient._initS3()
    const bucketList = await awsClient._getBucketList();
    const bucketName = bucketList.Buckets.filter((x) => x.Name.includes("pn-runtime-environment-variables"))[0].Name;
    const objects = await awsClient._listObjects(bucketName, 100);
    let runtimeVariableFiles = []
    if(!microservices) {
      runtimeVariableFiles = runtimeVariableFiles.concat(objects.Contents.filter((x) => x.Key.includes(fileEnvName)).map(x => x.Key));
    }
    else {
      const ms = microservices.split(',')
      runtimeVariableFiles = runtimeVariableFiles.concat(ms.map(x => `${x}/${fileEnvName}`))
    }
    for (const runVFile of runtimeVariableFiles) {
      try {
        const response = await awsClient._getObjectCommand(bucketName, runVFile);
        const fileKey = runVFile.replace("/","_")
        await saveFileFromBuffer(response.Body, `${outputFilesFolder}/${fileKey}`)
        const body = fs.readFileSync(`${outputFilesFolder}/${fileKey}`, { encoding: 'utf8', flag: 'r' }).split('\n');
        let loggingFile = [].concat(logging);
        console.log(body)
        for(const line of body) {
          const k = line.split("=")[0]
          if(!loggingFile.some(str => str.includes(k))){
            loggingFile.push(line)
          }
        }
        await awsClient._PutObject(bucketName, runVFile, loggingFile.join('\n'))
        console.log(`File ${runVFile} updated in ${account} account`)
      } catch (error) {
        error.Code != 'NoSuchKey' ?
        console.log(`Problem to get file ${runVFile} in ${account} account`, error) :
        console.log(`File ${runVFile} does not exist in ${account} account`)
      }
    }
  }
}

main();