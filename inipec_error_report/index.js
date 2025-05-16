const { AwsClientsWrapper } = require('pn-common')
const { parseArgs } = require('node:util')
const { open } = require('node:fs/promises')
const { unmarshall } = require('@aws-sdk/util-dynamodb')
const { openSync, closeSync, mkdirSync, appendFileSync } = require('node:fs')
const { join } = require('node:path')

// const env = "prod"
// const inputFile = "SORTED_dump_pn-national_registry_gateway_inputs-DLQ_2025-04-29T12-44-03-152Z.json"
// const redriveDate = "2025-04-28T17:43+02:00"

const args = [
  { name: "region", mandatory: false },
  { name: "env", mandatory: true },
  { name: "inputFile", mandatory: true },
  { name: "redriveDate", mandatory: true }
]

const parsedArgs = { values: { region, env, inputFile, redriveDate } } = parseArgs(
  {
    options: {
      region: { type: "string", short: "r", default: "eu-south-1" },
      env: { type: "string", short: "e" },
      inputFile: { type: "string", short: "f" },
      redriveDate: { type: "string", short: "d" }
    }
  })

// -------------------------------------------

async function main() {

  function _checkingParameters(args, parsedArgs) {

    const usage = `
    Usage: 
    
    node index.js \\
      [--region <region>] \\
      --env <env> \\
      --inputFile SORTED_<dump file name> \\
      --redriveDate <YYYY-MM-DDTHH:MM+02:00>
      
      `

    // Verifica se un argomento è stato inserito oppure inserito con valore vuoto
    args.forEach(el => {
      if (el.mandatory && !parsedArgs.values[el.name]) {
        console.log("\nParam \"" + el.name + "\" is not defined or empty.")
        console.log(usage)
        process.exit(1)
      }
    });
  }

  function createOutputFile() {
    mkdirSync(join(__dirname, "results"), { recursive: true });
    const dateIsoString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const resultPath = join(__dirname, "results", 'inipec_error_report_' + dateIsoString + '.json');
    return resultPath
  }

  async function _createInputFileCIDArray(inputFile) {

    const cidArray = []
    const inputFileHandler = await open(inputFile, 'r')

    for await (const line of inputFileHandler.readLines()) {

      const parsedLine = JSON.parse(line) // ogni linea è un JSON inline
      const obj = {
        correlationId: parsedLine.correlationId,
        approxElapsedDaysFromNow: parsedLine.approxElapsedDaysFromNow,
        iun: parsedLine.iun
      }
      cidArray.push(obj)
    }
    inputFileHandler?.close()
    return cidArray
  }

  async function _getStatusIndex(redriveDateValue) {

    const redriveDate = new Date(redriveDateValue)
    const { Items } = await dynamoDbClient._queryRequestByIndex("pn-batchPolling", "status-index", "status", "ERROR")
    const items = Items.map((el) => unmarshall(el))

    const result = []
    for (const elem of items) {
      const lastReservedDate = new Date(elem.lastReserved)
      if (lastReservedDate >= redriveDate) {
        result.push(elem)
      }
    }
    return result
  }

  function _extractPollingId(batchIdV, array) {
    for (const item of array) {
      if (item.batchId === batchIdV) {
        return item.pollingId
      }
    }
  }

  // -----------------------------------------------------------

  _checkingParameters(args, parsedArgs)

  const outputFile = createOutputFile();
  outputFileHandler = openSync(outputFile, 'a'); // Se il file non esiste verrà creato

  const dynamoDbClient = new AwsClientsWrapper("core", env)
  dynamoDbClient._initDynamoDB()

  // Creo l'array dei correlationId impattati a partire dal file in input
  const inputFileCidArray = await _createInputFileCIDArray(inputFile)

  // Estrapolo solo gli item per i quali -->
  //    pk status=ERROR AND lastReserved >= <data ultimo redrive>
  const statusIndexResult = await _getStatusIndex(redriveDate)

  for (const item of statusIndexResult) {

    // batchId impattato
    const batchId = item.batchId

    const batchRequestsResult = await dynamoDbClient._queryRequestByIndex(
      "pn-batchRequests", "batchId-lastReserved-index", "batchId", batchId
    )
    const batchRequestsRes = batchRequestsResult.Items.map((el) => unmarshall(el))

    const printed = [] // Array per scartare le righe duplicate dall'output ->
    // verificare se possono esserci item duplicati

    for (const item of batchRequestsRes) {

      // Estrazione del correlationId dal batchId impattato
      const correlationId = item.correlationId.match(/^[^~]+/)[0]
      const cf = item.cf

      // Se il correlationId impattato è tra quelli estratti da check_nr_response -->
      // stampa in output pollingId e taxId

      for (const item of inputFileCidArray) {
        if (item.correlationId.match(correlationId)?.[0]) {

          const outputObj = {
            iun: item.iun,
            pollingId: _extractPollingId(batchId, statusIndexResult),
            taxId: cf, // Codice Fiscale destinatario notifica
            approxElapsedDaysFromNow: item.approxElapsedDaysFromNow
          }

          const output = JSON.stringify(outputObj)
          appendFileSync(outputFileHandler, output + '\n')

          if (!printed.includes(output)) {
            printed.push(output)
            console.log(output)
          }
        }
      }
      // ----------------------------------------------
    }
  }

  closeSync(outputFileHandler)

}

main()
