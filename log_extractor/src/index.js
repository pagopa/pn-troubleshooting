const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { XmlReportParser } = require("./libs/XmlReportParser");
const { HtmlReportGenerator } = require("./libs/HtmlReportGenerator");
const { TestCaseLogExtractor } = require("./libs/TestCaseLogExtractor");
const { parseArgs } = require('util');

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

  /*console.log('PARAM{envName: '+ envName +', profileName: '+profileName+', roleArn: '+roleArn);*/
  
  const inputXmlReportPath = '../../target/surefire-reports/TEST-it.pagopa.pn.cucumber.CucumberB2BTest.xml';
  const inputJsonReportPath = '../../target/cucumber-report.json';

  const outputHtmlReportFolder = '../../target/surefire-reports/';
  const outputHtmlReportName = 'TEST-it.pagopa.pn.cucumber.CucumberB2BTest.html';



  const awsClient = new AwsClientsWrapper( envName, profileName, roleArn);

  if (alarm.includes("Fatal")){
    var fromEpochMs = (new Date("08/03/23 09:15:00")).getTime();
    var toEpochMs = Date.now();
    console.log('PIPPO ' + fromEpochMs + " " + toEpochMs);
    logGroupNames = ['/aws/ecs/pn-external-channel']
    var res = await awsClient.executeLogInsightQuery( logGroupNames, fromEpochMs, toEpochMs, "FATAL" ) 
    res.forEach(element => {
      console.log(element.AWS-XRAY-TRACE-ID)
    });
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

main();
