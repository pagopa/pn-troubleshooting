const { parseArgs } = require('util');
const fspdf = require('fs').promises;
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const { AwsClientsWrapper } = require("pn-common");

function appendDataToFile(folderName, fileName, data){
  if(!fs.existsSync(`${folderName}/${fileName}`))
    fs.appendFileSync(`${folderName}/${fileName}`, "iun,attachments,isValid,pageCount" + "\n")
  fs.appendFileSync(`${folderName}/${fileName}`, data + "\n")
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

async function validatePdf(pdfPath) {
  try {
    const pdfBuffer = await fspdf.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount()
    console.log(`Documento ${pdfPath.split('/')[1]} valido. Numero di pagine: ${pageCount}`);
    return { isValid: 'ok', pageCount: pageCount }
  } catch (error) {
    console.log(`ERROR: Documento ${pdfPath.split('/')[1]} non valido.`);
    return { isValid: 'ko', pageCount: 0 }
  }
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
      }
    },
  });  
  _checkingParameters(args, values)
  const outputFilesFolder = "files"
  const outputResultFolder = "results"
  _initFolder([outputFilesFolder, outputResultFolder])
  const awsClient = new AwsClientsWrapper( 'confinfo', envName );
  awsClient._initS3()
  const input = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n');
  const listBuckets = await awsClient._getBucketList();
  const bucketName = listBuckets.Buckets.filter((x) => x.Name.indexOf("safestorage")>0 && x.Name.indexOf("staging")<0)[0].Name;
  for(const data of input) {
    if (data === '') 
      continue
    const obj = JSON.parse(data)
    const iun = obj.iun
    const attachments = obj.attachments
    let validationResult = { isValid: '', pageCount: 0 }
    for (const fileKey of attachments) {
      try {
        const response = await awsClient._getObjectCommand(bucketName, fileKey);
        await saveFileFromBuffer(response.Body, `${outputFilesFolder}/${fileKey}`)
        validationResult = await validatePdf(`${outputFilesFolder}/${fileKey}`);
        if (validationResult.isValid !== 'ok')
          break
      } catch (error) {
        if(error.Code == 'NoSuchKey') {
          console.log(`FileKey ${error.Key} not found`)
          validationResult = { isValid: 'notfound', pageCount: 0 }
          break
        }
        else {
          console.log(`problem found`)
        }
      }
    }
    appendDataToFile(outputResultFolder, `${validationResult.isValid}.csv`, `${iun},${attachments.join("~")},${validationResult.isValid},${validationResult.pageCount}`)
  }
}

main();