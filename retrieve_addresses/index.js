const { parseArgs } = require('util');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config()
const { ApiClient } = require("./libs/api");
const { _parseCSV, sleep, appendJsonToFile } = require('pn-common/libs/utils');

const RECEIVER_TYPES = ['PF', 'PG']
const DOMICILE_TYPES = ['PHYSICAL', 'DIGITAL']
const usage = "Usage: node index.js --fileName <file-name> --receiverType <PF|PG> [--registry inad | --domicileType <PHYSICAL|DIGITAL>] [--referenceRequestDate <ISO-date>] [--taxIdColumn <column>] [--delimiter <delimiter>] [--delay <milliseconds>]"

function _exitWithUsage(message) {
  console.log(message)
  console.log(usage)
  process.exit(1)
}

function _checkingParameters(values) {
  ['fileName', 'receiverType'].forEach(name => {
    if (!values[name]) _exitWithUsage("Param " + name + " is not defined")
  })
  if (!RECEIVER_TYPES.includes(values.receiverType)) _exitWithUsage("Invalid receiverType: " + values.receiverType)
  if (values.registry !== undefined && values.registry !== 'INAD') _exitWithUsage("Invalid registry: " + values.registry)
  if (values.registry === 'INAD') {
    if (values.domicileType !== undefined && values.domicileType !== 'DIGITAL') _exitWithUsage("INAD only supports domicileType DIGITAL")
  } else if (!DOMICILE_TYPES.includes(values.domicileType)) {
    _exitWithUsage("Invalid domicileType: " + values.domicileType)
  }
  if (isNaN(Date.parse(values.referenceRequestDate))) _exitWithUsage("Invalid referenceRequestDate: " + values.referenceRequestDate)
  if (!/^\d+$/.test(values.delay) || !Number.isInteger(Number(values.delay)) || Number(values.delay) > 2147483647) {
    _exitWithUsage("Invalid delay: expected an integer between 0 and 2147483647 milliseconds")
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      fileName: { type: "string", short: "f" },
      receiverType: { type: "string", short: "r" },
      domicileType: { type: "string", short: "d" },
      registry: { type: "string" },
      referenceRequestDate: { type: "string", default: new Date().toISOString() },
      taxIdColumn: { type: "string", default: "codice_fiscale" },
      delimiter: { type: "string", default: "," },
      delay: { type: "string", default: "100" },
    },
  });
  values.receiverType = values.receiverType?.toUpperCase()
  values.domicileType = values.domicileType?.toUpperCase()
  values.registry = values.registry?.toUpperCase()
  _checkingParameters(values)

  const { fileName, receiverType, domicileType, registry, taxIdColumn, delimiter } = values
  const referenceRequestDate = new Date(values.referenceRequestDate).toISOString()
  const delay = Number(values.delay)
  const outputPath = `results/${new Date().toISOString().replace(/:/g, '-')}`

  const rows = await _parseCSV(fileName, delimiter)
  console.log(`Read ${rows.length} rows from ${fileName}`)

  for (const row of rows) {
    const taxId = row[taxIdColumn]
    if (!taxId) {
      console.log(`Skipped row without ${taxIdColumn}: ${JSON.stringify(row)}`)
      continue
    }
    const correlationId = `SEND-${uuidv4()}`
    try {
      const response = registry === 'INAD'
        ? await ApiClient.sendInadRequest(taxId, correlationId, receiverType)
        : await ApiClient.sendNationalRegistriesRequest(taxId, correlationId, receiverType, domicileType, referenceRequestDate)
      console.log(`TaxId ${taxId} sent successfully with correlationId ${correlationId}`)
      appendJsonToFile(outputPath, 'success.json', JSON.stringify({ taxId, correlationId, response }))
    } catch (error) {
      const detail = error.response ? { status: error.response.status, data: error.response.data } : error.message
      if (error.response?.status === 404) {
        console.log(`TaxId ${taxId}: notfound with correlationId ${correlationId}`)
        appendJsonToFile(outputPath, 'notfound.json', JSON.stringify({ taxId, correlationId, status: 'notfound', response: detail }))
      } else {
        console.error(`TaxId ${taxId} failed`, detail)
        appendJsonToFile(outputPath, 'failure.json', JSON.stringify({ taxId, correlationId, error: detail }))
      }
    }
    if (delay > 0) await sleep(delay)
  }
  console.log(`Results saved in ${outputPath}`)
}

main()
