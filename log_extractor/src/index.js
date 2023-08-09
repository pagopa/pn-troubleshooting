const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { ReportGenerator } = require("./libs/ReportGenerator");
const { parseArgs } = require('util');
const fs = require('fs');

function _getAlarmMicroserviceType(alarm) {
  if (alarm.toLowerCase().includes("b2b")){
    return alarm.toLowerCase().split("-b2b-")[0].substring(3) + "_b2b"
  }
  else if (alarm.toLowerCase().includes("web")){
    return alarm.toLowerCase().split("-web-")[0].substring(3) + "_web"
  }
  else {
    return alarm.toLowerCase().split("-io-")[0].substring(3) + "_io"
  }
}

function _prepareDate(start) {
  return (new Date(start.split("/")[1] + "/" + start.split("/")[0] + "/" + start.split("/")[2])).getTime();
} 

function _checkingParameters(args, values){
  const usage = "Usage: node ./src/index.js --envName <env-name>  --alarm|--key <alarm>|<key> [--start \"<start>\" --logGroups [<logGroups>]]"
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
    { name: "alarm", mandatory: false, subcommand: ["start"] },
    { name: "key", mandatory: false, subcommand: ["logGroups", "start"]},
    { name: "start", mandatory: false, subcommand: []},
    { name: "logGroups", mandatory: false, subcommand: []},
    { name: "profileName", mandatory: false, subcommand: []},
    { name: "roleArn", mandatory: false, subcommand: []}
  ]
  const values = {
    values: { envName, start, alarm, key, logGroups, profileName, roleArn },
  } = parseArgs({
    options: {
      envName: {
        type: "string",
        short: "e",
        default: undefined
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
      key: {
        type: "string",
        short: "k",
        default: undefined
      },
      logGroups: {
        type: "string",
        short: "l",
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

  _checkingParameters(args, values)
  
  const resultPath = 'results';
  const awsClient = new AwsClientsWrapper( envName, profileName, roleArn);
  const reportLogger = new ReportGenerator();

  await awsClient.init();
  var results = [];

  //PREPARE INTERVAL
  const fromEpochMs = _prepareDate(start)
  var toEpochMs = Date.now();
  const delay = 1000*60*30 // 30m
  if ((toEpochMs-fromEpochMs) > delay)
    toEpochMs = fromEpochMs + delay
  var extension = null
  if (alarm){
    if (alarm.includes("Fatal")) {
      extension = "csv"
      console.log("Fatal Alarm to handle!!!")
      const ms = (alarm.replace("-ErrorFatalLogs-Alarm", "")).replace("oncall-","")
      const resLogGroups = ["/aws/ecs/"+ms]
      results = await awsClient.getTraceIDsByQuery(resLogGroups, fromEpochMs, toEpochMs,  "stats count(*) by trace_id | filter @message like \/(?i)FatAL\/")
    }
    else if (alarm.includes("ApiGwAlarm")) {
      extension = "csv"
      console.log("Api Gateway Alarm to handle!!!")
      var resLogGroups = []
      let ms_type = _getAlarmMicroserviceType(alarm).split("_")
      const ms = ms_type[0]
      const type = ms_type[1]
      Object.keys(awsClient._apiGwMappings._mappings).forEach(v => { 
        awsClient._apiGwMappings._mappings[v].forEach(e => {
          for (let lg of e.logGroups) {
            if ((lg.includes(ms) && lg.toLowerCase().includes(type)) ||  e.path.includes(ms) ) {
              resLogGroups.push(lg)
            }
          }
          });
      });
      results = await awsClient.getTraceIDsByQuery(resLogGroups, fromEpochMs, toEpochMs,  "stats count(*) by xrayTraceId as trace_id | filter status >= 404")
    }
    else if (alarm.includes("DLQ-HasMessage")) {
      extension = "json"
      console.log("DLQ Message Alarm to handle!!!")
      const queueName = alarm.replace("-HasMessage", "")
      results = await awsClient.getEventsByDLQ(queueName)
    }
  }
  else if (key) {
    extension = "csv"
    console.log("Key " + key + " value discovered. Finding in LogGroup " + logGroups.toString() + "!!!")
    var resLogGroups = []
    logGroups.split(",").forEach(e => resLogGroups.push(e))
    console.log(resLogGroups )
    results = await awsClient.getTraceIDsByQuery(resLogGroups, fromEpochMs, toEpochMs,  "stats count(*) by trace_id | filter @message like \"" + key + "\"")
  }
  if (results.length > 0) {
    reportLogger.generateReport( resultPath, envName, results, extension )
  } else {
    console.log("Logs and/or Events not found")
  }
  
}

main();
