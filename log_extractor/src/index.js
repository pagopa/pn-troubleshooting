const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { CSVLogGenerator } = require("./libs/CSVLogGenerator");
const { parseArgs } = require('util');
const fs = require('fs');

function _getAlarmMicroserviceType(alarm) {
  if (alarm.toLowerCase().includes("b2b")){
    return alarm.toLowerCase().split("-b2b-")[0].substring(3) + "_b2b"
  }
  if (alarm.toLowerCase().includes("web")){
    return alarm.toLowerCase().split("-web-")[0].substring(3) + "_web"
  }
  else {
    return alarm.toLowerCase().split("-io-")[0].substring(3) + "_io"
  }
}

function _prepareDate(start) {
  return (new Date(start.split("/")[1] + "/" + start.split("/")[0] + "/" + start.split("/")[2])).getTime();
} 

async function main() {

  const args = [
    { name: "envName", mandatory: true },
    { name: "alarm", mandatory: true },
    { name: "start", mandatory: true },
    { name: "traceId", mandatory: false },
    { name: "profileName", mandatory: false },
    { name: "roleArn", mandatory: false }
  ]
  const values = {
    values: { envName, traceId, start, alarm, profileName, roleArn },
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
      start: {
        type: "string",
        short: "d",
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
  var results = [];

  //PREPARE INTERVAL
  const fromEpochMs = _prepareDate(start)
  console.log(fromEpochMs)
  var toEpochMs = Date.now();
  console.log(toEpochMs)
  const delay = 1000*60*30 // 30m
  console.log(fromEpochMs + "-" + toEpochMs + "= " + (toEpochMs-fromEpochMs))
  /*if ((toEpochMs-fromEpochMs) > delay)
    toEpochMs = fromEpochMs + delay
  console.log(toEpochMs)*/
  //GETTING LOG GROUPS
  const logGroups = await awsClient._fetchAllApiGwMappings();

  if (alarm.includes("Fatal")) {
    console.log("Fatal Alarm to handle!!!")
    const ms = (alarm.replace("-ErrorFatalLogs-Alarm", "")).replace("oncall-","")
    const resLogGroups = ["/aws/ecs/"+ms]
    console.log(resLogGroups)
    results = await awsClient.getTraceIDsByFatalAlarm(resLogGroups, fromEpochMs, toEpochMs,  "stats count(*) by trace_id | filter @message like \/(?i)FatAL\/")
  }
  else if (alarm.includes("ApiGwAlarm")) {
    console.log("Api Gateway Alarm to handle!!!")
    var resLogGroups = []
    let ms_type = _getAlarmMicroserviceType(alarm).split("_")
    const ms = ms_type[0]
    const type = ms_type[1]
    console.log("PIPPO"  + JSON.stringify(logGroups._mappings))
    Object.keys(logGroups._mappings).forEach(v => { 
      logGroups._mappings[v].forEach(e => {
        for (let lg of e.logGroups) {
          if ((lg.includes(ms) && lg.toLowerCase().includes(type)) ||  e.path.includes(ms) ) {
            resLogGroups.push(lg)
          }
        }
        });
    });
    console.log(resLogGroups)
    results = await awsClient.getTraceIDsByFatalAlarm(resLogGroups, fromEpochMs, toEpochMs,  "stats count(*) by xrayTraceId as trace_id | filter status >= 404")
  }

  if (results.length > 0) {
    csvLogger.generateCSV( resultPath, envName, results )
  }
  else {
    console.log("Logs not found")
  }
  
}

main();
