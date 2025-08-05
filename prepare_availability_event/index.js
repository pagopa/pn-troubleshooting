
const { parseArgs } = require('util');
const fs = require('fs');

function appendDataToFile(folderName, fileName, data){
    fs.appendFileSync(`${folderName}/${fileName}`, data + "\n")
}

function _initFolder(values){
  values.forEach(value => {
    if(!fs.existsSync(value))
      fs.mkdirSync(value, { recursive: true });
  });
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --fileName <file-name>"
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

function _prepareData(legalfact, length, accountId, timestamp) {
    data = {"Records":[{"eventVersion":"2.1","eventSource":"aws:s3","awsRegion":"eu-south-1","eventTime":"","eventName":"ObjectCreated:Put","userIdentity":{"principalId":"AWS:AROAVDIA4RIRD2D74Z43R:e79c5212e82641acb5bda5269a3116bb"},"requestParameters":{"sourceIPAddress":"10.11.11.110"},"responseElements":{"x-amz-request-id":"N8MAD2QBPP5E02YR","x-amz-id-2":"2JwAFuYOhR/b/w88z+8NXa9c4vUvX2RHGlbRChqwHoDgi9oBDRYvJ72eM3uO5L3BmshGqPeCY91Mag6vl30p0l7W+h/lzKcjldFUOqBI/sA="},"s3":{"s3SchemaVersion":"1.0","configurationId":"25d4e300-4a41-452b-ba32-b903e6e31db6","bucket":{"name":"","ownerIdentity":{"principalId":"A3FTK2F08564LO"},"arn":""},"object":{"key":"","size": "","eTag":"a4e4022c2b19fafdb20fb35eee49aeee","versionId":"elHuonftZG1DaRknDKP90Huq57iydPe3","sequencer":"00688494ECDBBFCFB4"}}}]}
    const bucketName = `pn-safestorage-eu-south-1-${accountId}`
    data.Records[0].s3.object.key = legalfact
    data.Records[0].s3.object.size = length
    data.Records[0].s3.bucket.name = `${bucketName}`
    data.Records[0].s3.bucket.arn = `arn:aws:s3:::${bucketName}`
    data.Records[0].eventTime = timestamp
    return JSON.stringify({
        Body: JSON.stringify(data)
    })
}

async function main() {

  const args = [
    { name: "fileName", mandatory: true, subcommand: [] },
    { name: "accountId", mandatory: true, subcommand: [] },
    { name: "timestamp", mandatory: true, subcommand: [] },
  ]
  const values = {
    values: { fileName, accountId, timestamp },
  } = parseArgs({
    options: {
      fileName: {
        type: "string", short: "f", default: undefined
      },
      accountId: {
        type: "string", short: "a", default: undefined
      },
      timestamp: {
        type: "string", short: "f", default: undefined
      }
    },
  });  
  _checkingParameters(args, values)
  const outputResultFolder = "results"
  _initFolder([outputResultFolder])
  const input = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n');
  for(const data of input) {
    if (data === '') 
      continue
    const legalfact = data.split(',')[0]
    const length = data.split(',')[1]
    appendDataToFile(outputResultFolder, `result.json`, _prepareData(legalfact, length, accountId, timestamp))
  }
}

main();