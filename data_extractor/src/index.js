const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { ReportGenerator } = require("./libs/ReportGenerator");
const { parseArgs } = require('util');

function _getAlarmMicroserviceType(alarm) {
  if (alarm.toLowerCase().includes("-b2b-")){
    return alarm.toLowerCase().split("-b2b-")[0].substring(3) + "_b2b"
  }
  else if (alarm.toLowerCase().includes("-web-")){
    return alarm.toLowerCase().split("-web-")[0].substring(3) + "_web"
  }
  else if (alarm.toLowerCase().includes("-cn_be-")){
    return alarm.toLowerCase().split("-cn_be-")[0].substring(3) + "_cnbe"
  }
  else if (alarm.toLowerCase().includes("-be-")){
    return alarm.toLowerCase().split("-be-")[0].substring(3) + "_be"
  }
  else {
    return alarm.toLowerCase().split("-io-")[0].substring(3) + "_io"
  }
}

function _prepareDate(start) {
  return (new Date(start.split("/")[1] + "/" + start.split("/")[0] + "/" + start.split("/")[2])).getTime();
} 

function _checkingParameters(args, values){
  const usage = "Usage: ./src/index.js --envName <env-name> --alarm|--input|--url <alarm>|<input>|<url> [--start \"<start>\" --logGroups [<logGroups>] --traceId <traceId> --limit <limit>]"
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
  if (Number(limit) > 150) {
    console.log("Limit value must be below 100! Default value is 20")
    process.exit(1)
  }
}

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "alarm", mandatory: false, subcommand: [] },
    { name: "input", mandatory: false, subcommand: ["logGroups"]},
    { name: "url", mandatory: false, subcommand: ["traceId"]},
    { name: "start", mandatory: true, subcommand: []},
    { name: "logGroups", mandatory: false, subcommand: []},
  //  { name: "profileName", mandatory: false, subcommand: []},
  //  { name: "roleArn", mandatory: false, subcommand: []},
    { name: "limit", mandatory: false, subcommand: []}
  ]
  const values = {
    values: { envName, start, alarm, input, logGroups, profileName, roleArn, limit, url, traceId },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      alarm: { 
        type: "string", short: "a", default: undefined
      },
      start: {
        type: "string", short: "d", default: undefined
      },
      input: {
        type: "string", short: "k", default: undefined
      },
      logGroups: {
        type: "string", short: "l", default: undefined
      },
      profileName: {
        type: "string", short: "p", default: undefined
      },
      roleArn: {
        type: "string", short: "r", default: undefined
      },
      limit: {
        type: "string", short: "m", default: "20"
      },
      url: {
        type: "string", short: "u", default: undefined
      },
      traceId: {
        type: "string", short: "t", default: undefined
      }
    },
  });  

  _checkingParameters(args, values)

  const resultPath = 'results';
  const awsClient = new AwsClientsWrapper( envName, profileName, roleArn);
  const reportLogger = new ReportGenerator();

  if (Number(limit) > 150 ) {
    var lim = 150;
  }
  else {
    var lim = Number(limit)
  } 
  await awsClient.init();
  var results = null;

  //PREPARE INTERVAL
  const timestamp = _prepareDate(start)
  const delay = 1000*60*120;
  const now = Date.now();
  const fromEpochMs = timestamp - 1000*60*60;
  const toEpochMs = fromEpochMs + delay > now ? now : fromEpochMs + delay;
  var extension = null
  //ALARM
  if (alarm){
    if (alarm.includes("Fatal")) {
      extension = "csv"
      console.log("Fatal Alarm to handle!!!")
      const ms = (alarm.replace("-ErrorFatalLogs-Alarm", "")).replace("oncall-","")
      const resLogGroups = ["/aws/ecs/"+ms]
      results = await awsClient.getTraceIDsByQuery(resLogGroups, fromEpochMs, toEpochMs,  "stats count(*) by trace_id | filter @message like \/(?i)FatAL\/", lim)
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
      results = await awsClient.getTraceIDsByQuery(resLogGroups, fromEpochMs, toEpochMs,  "stats count(*) by xrayTraceId as trace_id | filter status >= 500", lim)
    }
    else if (alarm.includes("DLQ-HasMessage") || alarm.includes("-HasDLQMessage")) {
      extension = "json"
      console.log("DLQ Message Alarm to handle!!!")
      const queueName = alarm.replace("-HasMessage", "")
      results = await awsClient.getEventsByDLQ(queueName, lim)
    }
  }
  //INPUT
  else if (input) {
    extension = "csv"
    console.log("Input value " + input + " discovered. Finding in LogGroup " + logGroups.toString() + "!!!")
    var resLogGroups = []
    logGroups.split(",").forEach(e => resLogGroups.push(e))
    results = await awsClient.getTraceIDsByQuery(resLogGroups, fromEpochMs, toEpochMs,  "stats count(*) by trace_id | filter @message like \"" + input + "\"", lim)
  }
  //URL
  else if (url) {
    extension = "csv"
    console.log("URL " + url + " discovered. Finding in related LogGroup!!!")
    
    const resLogGroups = await awsClient._apiGwMappings.getApiGwLogGroups(url)
    if (resLogGroups.length > 0){
      results = await awsClient.getTraceIDsByQuery(resLogGroups, fromEpochMs, toEpochMs,  "stats count(*) by xrayTraceId as trace_id | filter @message like \"" + traceId + "\"", limit)
    }
  }
  if (results) {
    reportLogger.generateReport( resultPath, envName, results, extension )
  } else {
    console.log("Logs and/or Events not found")
  }
  
}

main();
