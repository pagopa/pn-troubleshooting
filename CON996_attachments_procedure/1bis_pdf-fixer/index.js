const { parseArgs } = require('util');
const fs = require('fs');
const { AwsClientsWrapper } = require("pn-common");
const { ApiClient } = require("./libs/api");
require('dotenv').config()

const report = {}

async function sleep( ms ) {
  return new Promise( ( accept, reject) => {
    setTimeout( () => accept(null) , ms );
  })
}

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

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> --accountConfinfoId <accountConfinfoId>"
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
    { name: "accountConfinfoId", mandatory: true, subcommand: [] },
    
  ]
  const values = {
    values: { envName, fileName, accountConfinfoId },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      },
      accountConfinfoId: {
        type: "string", short: "b", default: undefined
      }
    },
  });  
  _checkingParameters(args, values)
  
  const bucket = 'pn-safestorage-eu-south-1-'+bucketName
  const awsClient = new AwsClientsWrapper( 'confinfo', envName );
  awsClient._initS3()
  const fileKeys = []
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  for(let i = 0; i < fileRows.length; i++){
    const line = JSON.parse(fileRows[i])
    for(let j=0; j<line.attachments.length; j++){
      fileKeys.push(line.attachments[j]);
    }
  }
  fs.mkdirSync(`inputs`, { recursive: true });
  fs.mkdirSync(`pngs`, { recursive: true });
  fs.mkdirSync(`outputs`, { recursive: true });
  
  for(let i=0; i<fileKeys.length; i++){
    const fileKeyToUseAsIndex = fileKeys[i]
    const fileKey = fileKeyToUseAsIndex.split('?')[0] // remove '?docDat' from fileKey
    
    // check if file exists in output folder
    const outputExists = fs.existsSync('outputs/printed_fixed_'+fileKey);
    if(outputExists){
        console.log('file '+fileKey+' already fixed');
        report[fileKey] = 'outputs/printed_fixed_'+fileKey;
        continue;
    }

    const outputPath = `inputs/${fileKey}`;
    const fixedOutputPath = `outputs/printed_fixed_${fileKey}`;

    //Downloading file from s3
    const response = await awsClient._getObjectCommand(bucket, fileKey);
    await saveFileFromBuffer(response.Body, outputPath)

    //Convert file with pdf raster
    const data = await ApiClient.requestToPdfRaster(outputPath)
    await saveFileFromBuffer(data, fixedOutputPath)
    console.log('fixed '+fileKey+' and saved to '+fixedOutputPath);

    report[fileKeyToUseAsIndex] = fixedOutputPath;
  }
}

main().then(
  () => console.log('done'))
  .catch(console.error)
  .finally(() => {
      fs.writeFileSync('report.json', JSON.stringify(report, null, 2))
  });