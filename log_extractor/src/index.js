const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { CSVLogGenerator } = require("./libs/CSVLogGenerator");
const { parseArgs } = require('util');
const fs = require('fs')

function _getAlarmType(alarm) {
  if (alarm.toLowerCase().includes("b2b")){
    return "b2b"
  }
  if (alarm.toLowerCase().includes("web")){
    return "web"
  }
  else {
    return "io"
  }
}

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
  if (alarm.includes("Fatal")) {
    console.log("Fatal Alarm to handle!!!")
    var fromEpochMs = (new Date("08/04/23 15:00:00")).getTime();
    var toEpochMs = Date.now();
    let delay = 1000*60*60*1 // 2hours
    /*if ((toEpochMs-fromEpochMs) > delay)
      toEpochMs = fromEpochMs + delay*/
    logGroupNames = ['/aws/ecs/pn-external-channel']
    var results = await awsClient.getTraceIDsByFatalAlarm(logGroupNames, fromEpochMs, toEpochMs,  "stats count(*) by trace_id | filter @message like \/(?i)FatAL\/")
    csvLogger.generateCSV( resultPath, envName, results )
  }
  else if (alarm.includes("ApiGwAlarm")) {
    console.log("Api Gateway Alarm to handle!!!")
    const type = _getAlarmType(alarm)
    console.log(type)
    var fromEpochMs = (new Date("08/05/23 15:47:00")).getTime();
    var toEpochMs = Date.now();
    let delay = 1000*60*60*1 // 2hours
    if ((toEpochMs-fromEpochMs) > delay)
      toEpochMs = fromEpochMs + delay
    var res = await awsClient._fetchAllApiGwMappings();
    console.log(JSON.stringify(res._mappings))
    Object.keys(res._mappings).forEach(v => { 
      res._mappings[v].forEach(e => {
        //console.log(e.logGroups)
        for (let lg of e.logGroups){
          
        }
      });
    });
    //Object.keys(res._mappings).keys().map( el => console.log(res._mappings[el].logGroup ));
  }
  
}

main();
