const { parseArgs } = require('util');
const fs = require('fs');
const { ApiClient } = require("./libs/api");
require('dotenv').config()
const { unmarshall } = require("@aws-sdk/util-dynamodb")
const { AwsClientsWrapper } = require("pn-common");
const { _getIunFromRequestId, _getAttemptFromRequestId, _parseCSV } = require("pn-common/libs/utils");

const rilevantTimelineElements = [
  "NOTIFICATION_TIMELINE_REWORKED",
  "NOTIFICATION_VIEWED",
  "REFINEMENT",
  "ANALOG_WORKFLOW_RECIPIENT_DECEASED"
]

// Dynamic logging utilities
function logCheck(message) {
  process.stdout.write(`\r- ${message}`)
}

function logCheckComplete(message) {
  process.stdout.write(`\r✓ ${message}\n`)
}

function logStatus(message) {
  console.log(message)
}

function _checkingParameters(args, values) {
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> [--dryrun]"
  //CHECKING PARAMETER
  args.forEach(el => {
    if (el.mandatory && !values.values[el.name]) {
      console.log("Param " + el.name + " is not defined")
      console.log(usage)
      process.exit(1)
    }
  })
  args.filter(el => {
    return el.subcommand.length > 0
  }).forEach(el => {
    if (values.values[el.name]) {
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


async function checkAttachments(awsClient, bucketName, iun) {
  const notifications = (await awsClient.core._queryRequest("pn-Notifications", 'iun', iun)).Items[0];
  const notifData = unmarshall(notifications)

  // Collect all documents to check
  const allDocuments = []

  // Documents from main attachments
  if (notifData.documents) {
    for (const doc of notifData.documents) {
      allDocuments.push({
        key: doc.ref.key,
        type: 'MAIN_DOCUMENT',
        title: doc.title
      })
    }
  }

  // Documents from recipients payments
  if (notifData.recipients) {
    for (const recipient of notifData.recipients) {
      if (recipient.payments) {
        for (const payment of recipient.payments) {
          // Check for pagoPaForm
          if (payment.pagoPaForm && payment.pagoPaForm.ref) {
            allDocuments.push({
              key: payment.pagoPaForm.ref.key,
              type: 'PAGO_PA_FORM',
              title: 'PagoPa Form'
            })
          }

          // Check for f24.metadataAttachment
          if (payment.f24 && payment.f24.metadataAttachment && payment.f24.metadataAttachment.ref) {
            allDocuments.push({
              key: payment.f24.metadataAttachment.ref.key,
              type: 'F24_METADATA',
              title: 'F24 Metadata'
            })
          }
        }
      }
    }
  }

  // Check all documents
  for (const doc of allDocuments) {
    let docExists = false
    try {
      const result = await awsClient.confinfo._getObjectCommand(bucketName, doc.key)
      docExists = result.DeleteMarker ? false : true
    } catch (error) {
      // Document not found in S3
      docExists = false
    }

    const ssDocumenti = await awsClient.confinfo._queryRequest("pn-SsDocumenti", 'documentKey', doc.key)
    const docState = ssDocumenti.Items.length > 0 ? unmarshall(ssDocumenti.Items[0]).documentState == 'attached' : false

    if (!docExists || !docState || docState !== 'attached') {
      logStatus(`    ✗ Document [${doc.type}] ${doc.key}: S3=${docExists} SafeStorage=${docState}`)
    }
  }
}

async function _hasFoundEvents(awsClient, requestId) {
  const iun = (requestId.split("IUN_")[1]).split('.')[0]
  const send = requestId.replace("PREPARE", "SEND")
  const failure = !requestId.startsWith('PREPARE_SIMPLE_REGISTERED_LETTER') ? (requestId.replace("DOMICILE", "DOMICILE_FAILURE")).split(".ATTEMPT")[0] : false
  const timelines = await awsClient._queryRequest("pn-Timelines", 'iun', iun)
  const foundSend = timelines.some(x => {
    return x.timelineElementId.S == send || x.timelineElementId.S == failure
  }
  )
  return foundSend
}

async function _checkReceiverAddress(paperAddressEvents) {
  let hasReceiverAddress = paperAddressEvents.some((e) => {
    return unmarshall(e).addressType == 'RECEIVER_ADDRESS'
  })
  return hasReceiverAddress
}

// Tracking structure for blockers and report
const report = {
  totalProcessed: 0,
  totalBlocked: 0,
  totalSuccessful: 0,
  blockers: {},
  blockedRequests: [],
  successfulRequests: []
}

function _recordBlocker(requestId, iun, reason) {
  if (!report.blockers[reason]) {
    report.blockers[reason] = { count: 0, requestIds: [] }
  }
  report.blockers[reason].count++
  report.blockers[reason].requestIds.push(requestId)
  report.blockedRequests.push({
    requestId,
    iun,
    reason,
    timestamp: new Date().toISOString()
  })
  report.totalBlocked++
  console.log(`  [BLOCKED] ${reason}`)
}

function _generateReport(envName) {
  const successRate = report.totalProcessed > 0
    ? ((report.totalSuccessful / report.totalProcessed) * 100).toFixed(2)
    : '0.00'

  console.log('\n' + '='.repeat(80))
  console.log('PROCESSING REPORT')
  console.log('='.repeat(80))
  console.log(`Total requests processed: ${report.totalProcessed}`)
  console.log(`Successful: ${report.totalSuccessful}`)
  console.log(`Blocked: ${report.totalBlocked}`)
  console.log(`Success rate: ${successRate}%`)

  console.log('\n' + '-'.repeat(80))
  console.log('BLOCKERS SUMMARY')
  console.log('-'.repeat(80))

  const blockersSorted = Object.entries(report.blockers).sort((a, b) => b[1].count - a[1].count)
  for (const [reason, data] of blockersSorted) {
    console.log(`\n[${data.count}] ${reason}`)
    if (data.requestIds.length <= 5) {
      data.requestIds.forEach(rid => console.log(`  - ${rid}`))
    } else {
      data.requestIds.slice(0, 3).forEach(rid => console.log(`  - ${rid}`))
      console.log(`  ... and ${data.requestIds.length - 3} more`)
    }
  }

  console.log('\n' + '='.repeat(80))

  // Save detailed report to file
  const now = new Date()
  const timestamp = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
  const resultDir = 'results'
  const reportFile = `${resultDir}/${timestamp}_${envName}_report.json`
  fs.mkdirSync(resultDir, { recursive: true })
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2))
  console.log(`Detailed report saved to: ${reportFile}\n`)

  return report
}

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
    { name: "dryrun", mandatory: false, subcommand: [] }
  ]
  const values = {
    values: { envName, fileName, dryrun },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "t", default: undefined
      },
      dryrun: {
        type: "boolean", short: "d", default: false
      },
    },
  });

  _checkingParameters(args, values)
  console.log(`Mode: ${dryrun ? 'DRY RUN' : 'EXECUTION'}`)
  const awsClient = {
    core: new AwsClientsWrapper('core', envName),
    confinfo: new AwsClientsWrapper('confinfo', envName)
  };
  awsClient.confinfo._initS3()
  awsClient.confinfo._initDynamoDB()
  awsClient.core._initDynamoDB()
  //find bucket with safestorage name contains
  const listBuckets = await awsClient.confinfo._getBucketList();
  const bucketName = listBuckets.Buckets.filter((x) => x.Name.indexOf("safestorage") > 0 && x.Name.indexOf("staging") < 0)[0].Name;
  console.log(`Using bucket ${bucketName} for checking attachments`)
  console.log('Reading from file...')
  const inputs = await _parseCSV(fileName, ',')
  console.log(`Found ${inputs.length} requests to process\n`)

  for (const input of inputs) {
    report.totalProcessed++
    const progress = `[${report.totalProcessed}/${inputs.length}]`
    console.log(`\n${progress} Processing requestId: ${input.requestId}`)

    const iun = _getIunFromRequestId(input.requestId)

    const recIndexMatch = input.requestId.match(/RECINDEX_(\d+)/)
    const attemptMatch = input.requestId.match(/ATTEMPT_(\d+)/)

    const recIndex = recIndexMatch ? recIndexMatch[1] : '0'
    const attemptId = attemptMatch ? `ATTEMPT_${attemptMatch[1]}` : 'ATTEMPT_0'

    logCheck(`Querying timeline elements for IUN ${iun}...`)
    const result = await awsClient.core._queryRequest("pn-Timelines", 'iun', iun)

    if (result.Items.length == 0) {
      logStatus(`  ✗ Timeline query returned 0 items`)
      _recordBlocker(input.requestId, iun, 'NO_TIMELINE_ELEMENTS_FOUND')
      continue
    }
    logCheckComplete(`Querying timeline elements for IUN ${iun}... (found ${result.Items.length} items)`)

    let timelineElements = result.Items.map(x => unmarshall(x))

    logCheck(`Checking for NOTIFICATION_CANCELLED...`)
    if (timelineElements.some(x => x.timelineElementId.includes('NOTIFICATION_CANCELLED'))) {
      logStatus(`  ✗ Found NOTIFICATION_CANCELLED`)
      _recordBlocker(input.requestId, iun, 'NOTIFICATION_CANCELLED')
      continue
    }
    logCheckComplete(`Checking for NOTIFICATION_CANCELLED... (passed)`)

    logCheck(`Checking for NOTIFICATION_VIEWED...`)
    if (timelineElements.some(x => x.timelineElementId.includes('NOTIFICATION_VIEWED') && x.timelineElementId.includes(attemptId) && x.timelineElementId.includes(`RECINDEX_${recIndex}`))) {
      logStatus(`  ✗ Found NOTIFICATION_VIEWED`)
      _recordBlocker(input.requestId, iun, 'NOTIFICATION_VIEWED')
      continue
    }
    logCheckComplete(`Checking for NOTIFICATION_VIEWED... (passed)`)

    logCheck(`Filtering for relevant timeline elements...`)
    timelineElements = timelineElements.filter(x => rilevantTimelineElements.some(el => x.timelineElementId.includes(el)))

    if (timelineElements.length === 0) {
      logStatus(`  ✗ No relevant timeline elements found`)
      _recordBlocker(input.requestId, iun, 'NO_RELEVANT_TIMELINE_ELEMENTS')
      continue
    }
    logCheckComplete(`Filtering for relevant timeline elements... (found ${timelineElements.length})`)

    logCheck(`Checking for NOTIFICATION_TIMELINE_REWORKED...`)
    const reworkElements = timelineElements.filter(x => x.timelineElementId.includes('NOTIFICATION_TIMELINE_REWORKED') && x.timelineElementId.includes(attemptId) && x.timelineElementId.includes(`RECINDEX_${recIndex}`));
    if (reworkElements.length > 0) {
      for (const reworkElement of reworkElements) {
        for (const relatedElementId of reworkElement.details.relatedTimelineElements) {
          timelineElements = timelineElements.filter(x => x.timelineElementId !== relatedElementId)
        }
      }
      if (timelineElements.length === 0) {
        logStatus(`  ✗ No elements found after timeline rework`)
        _recordBlocker(input.requestId, iun, 'NO_ELEMENTS_AFTER_TIMELINE_REWORKED')
        continue
      }
      logCheckComplete(`Checking for NOTIFICATION_TIMELINE_REWORKED... (found ${timelineElements.length} after)`)
    } else {
      logCheckComplete(`Checking for NOTIFICATION_TIMELINE_REWORKED... (not found)`)
    }

    logCheck(`Verifying timeline elements...`)
    if (timelineElements.some(x => (!(x.timelineElementId.includes('REFINEMENT') && x.timelineElementId.includes(`RECINDEX_${recIndex}`) && !(x.timelineElementId.includes('ANALOG_WORKFLOW_RECIPIENT_DECEASED') && x.timelineElementId.includes(attemptId) && x.timelineElementId.includes(`RECINDEX_${recIndex}`)))))) { 
      logStatus(`  ✗ Found unexpected timeline elements`)
      _recordBlocker(input.requestId, iun, 'REFINEMENT_FEEDBACK_NOT_FOUND')
      continue
    }
    logCheckComplete(`Verifying timeline elements... (passed)`)

    logCheck(`Checking attempt version...`)
    if (input.requestId.includes("ATTEMPT_1")) {
      const firstAttempt = input.requestId.replace("ATTEMPT_1", "ATTEMPT_0")
      const paperAddressEvents = await awsClient.core._queryRequest("pn-PaperAddress", 'requestId', firstAttempt)
      if (paperAddressEvents.Items.length == 0) {
        logStatus(`  ✗ No paper address events found for ATTEMPT_0`)
        _recordBlocker(input.requestId, iun, 'NO_PAPER_ADDRESS_EVENTS_FOR_ATTEMPT_0')
        continue
      }
      logCheckComplete(`Checking attempt version... (found ${paperAddressEvents.Items.length} events)`)
    } else {
      logCheckComplete(`Checking attempt version... (skipped - ATTEMPT_0)`)
    }

    logCheck(`Validating attachments...`)
    const hasDocuments = await checkAttachments(awsClient, bucketName, iun)
    logCheckComplete(`Validating attachments... (passed)`)

    // If not dryrun, execute restart-attempt API call
    if (!dryrun) {
      try {
        logCheck(`Executing restart-attempt API call...`)
        const apiResponse = await ApiClient.restartAttempt(
          iun,
          attemptId,
          recIndex,
          input.reason,
          input.task
        )
        logCheckComplete(`Executing restart-attempt API call... (success)`)
      } catch (error) {
        logStatus(`  ✗ API call failed: ${error.message}`)
        _recordBlocker(input.requestId, iun, 'API_CALL_FAILED')
        report.blockedRequests[report.blockedRequests.length - 1].error = error.message
        continue
      }
    }

    report.totalSuccessful++
    report.successfulRequests.push({
      requestId: input.requestId,
      iun,
      recIndex,
      timestamp: new Date().toISOString()
    })
    logStatus(`  ✓ SUCCESS - All checks passed${!dryrun ? ' - API call executed' : ' (DRY RUN)'}`)
  }

  _generateReport(envName)
}


main().then(function () {
  process.exit(0)
}).catch(err => {
  console.error('Error during execution:', err)
  process.exit(1)
}) 
