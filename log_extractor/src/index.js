const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { CSVLogGenerator } = require("./libs/CSVLogGenerator");
const { parseArgs } = require('util');
const fs = require('fs')

async function main() {

  const args = [
    { name: "envName", mandatory: true },
    { name: "alarm", mandatory: true },
    { name: "traceId", mandatory: false },
    { name: "profileName", mandatory: false },
    { name: "roleArn", mandatory: false }
  ]
  const values = {
    values: { envName, traceId, alarm, profileName, roleArn },
  } = parseArgs({
    options: {
      envName: {
        type: "string",
        short: "e",
      },
      alarm: {
        type: "string",
        short: "a",
        default: undefined
      },
      traceId: {
        type: "string",
        short: "t",
        default: undefined
      },
      profileName: {
        type: "string",
        short: "p",
        default: undefined
      },
      roleArn: {
        type: "string",
        short: "r",
        default: undefined
      }
    },
  });

  args.forEach(k => {
      if(!values.values[k.name]) {
        if (k.mandatory) {
          console.log("Parameter '" + k.name + "' is not defined")
          console.log("Usage: node ./src/index.js --envName <env-name> --traceId <trace-id> --alarm <alarm>") //TODO Verify usage string  
          process.exit(1)
        }
      }
    });

  
  const resultPath = 'results';
  const awsClient = new AwsClientsWrapper( envName, profileName, roleArn);
  const csvLogger = new CSVLogGenerator();

  await awsClient.init();
  if (alarm.includes("Fatal")){
    var fromEpochMs = (new Date("08/04/23 15:00:00")).getTime();
    var toEpochMs = Date.now();
    let delay = 1000*60*60*1 // 2hours
    /*if ((toEpochMs-fromEpochMs) > delay)
      toEpochMs = fromEpochMs + delay*/
    logGroupNames = ['/aws/ecs/pn-external-channel']
    var results = await awsClient.getTraceIDsByFatalAlarm(logGroupNames, fromEpochMs, toEpochMs,  "stats count(*) by trace_id | filter @message like \/(?i)FatAL\/")
    csvLogger.generateCSV( resultPath, envName, results )
  }
  
  /*var res = await awsClient._fetchAllApiGwMappings();*/

  //console.log(res);
 /* const logExtractor = new TestCaseLogExtractor( awsClient );
  const xmlReportParser = new XmlReportParser();
  const htmlReportGenerator = new HtmlReportGenerator();
  
  try {
    await awsClient.init();

    
    const testCases = xmlReportParser.parse( inputXmlReportPath );
    const testCasesIds = testCases.listTestCasesIds();
    console.log( "Loaded TestCases: ", testCasesIds );
  
    await htmlReportGenerator.generateReport( 
        inputJsonReportPath, 
        outputHtmlReportFolder + outputHtmlReportName, 
        envName, 
        testCasesIds
      );

    
    const logsByTestCaseAndCall = await logExtractor.extractHttpCallLogs( testCases, console );
    
    await htmlReportGenerator.generateTestCasesLogsReports( 
        outputHtmlReportFolder, 
        logsByTestCaseAndCall 
      );
  }
  catch( error ) {
    console.error( error );
  }
*/
}

async function writeResults(result){
  const folder = 'result/fatal/'+new Date().toISOString()

  const csvContent = [];
  csvContent.push(Object.keys(result[0]).join(',')); // Intestazione

  result.forEach((item) => {
      const values = Object.values(item).map(value => `"${value}"`);
      csvContent.push(values.join(','));
  });

  // Convertire il contenuto CSV in una stringa
  const csvString = csvContent.join('\n');

  // Scrivere la stringa CSV in un file
  fs.writeFileSync('output.csv', csvString, 'utf-8');

  console.log('File CSV creato con successo.');
}
main();
