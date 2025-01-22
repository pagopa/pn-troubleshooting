const { AwsClientsWrapper } = require("../libs/AwsClientWrapper");
const { parseArgs } = require('util');

async function lambda_start_stop_env() {
  const args = [
    { name: "awsProfile", mandatory: true, subcommand: [] },
    { name: "region", mandatory: false, subcommand: [] },
    { name: "env", mandatory: true, subcommand: [] },
    { name: "action", mandatory: true, subcommand: [] }
  ]
 
   
  const parsedArgs = { values: { awsProfile, region, env, action }}
  = parseArgs({
    options: {
      awsProfile: {
        type: "string",
        short: "a"
      },
      region: {
        type: "string", 
        short: "r"
      },
      env: {
        type: "string",
        short: "e"
      },
      action: {
        type: "string",
        short: "d"
      }
    }
  });

  function _checkingParameters(args, parsedArgs){
    const usage = "Usage: node lambda_start_stop_env.js --awsProfile <aws-profile> " +
                  "[--region <region>] --env <env> --action <start|stop>";
    //CHECKING PARAMETER
    args.forEach(el => {
      if(el.mandatory && !parsedArgs.values[el.name]){
        console.log("Param " + el.name + " is not defined")
        console.log(usage)
        process.exit(1)
      }
    })
    args.filter(el=> {
      return el.subcommand.length > 0
    }).forEach(el => {
      if(parsedArgs.values[el.name]) {
        el.subcommand.forEach(val => {
          if (!values[val]) {
            console.log("SubParam " + val + " is not defined")
            console.log(usage)
            process.exit(1)
          }
        })
      }
    })
  }  
  _checkingParameters(args, parsedArgs)

  // Logica sul tipo di action in input tramite arg "--action|-d" 
  // verificare valori input tramite comando: "aws lambda invoke help"

  let parsed_action = parsedArgs.values.action
  const parsed_env = parsedArgs.values.env

  // Controllo tipologia azione
  switch(parsed_action) {
    case "start":
      parsed_action = "Start" 
      break;
    case "stop":
      parsed_action = "Stop" 
      break;
    default:
      no_action_error="\nError: Action \"" + parsed_action + "\" is not defined.\n"
                      + "Avaliable values are \"start\" and \"stop\"\n"
		      + "Exit with error 2.\n";
      console.log(no_action_error);
      process.exit(2) // posso assegnare il valore che voglio al codice errore?
  }

  const lambdaName = "Lambda-Ecs-" + parsed_action + "-" + parsed_env 
  console.log("Launching lambda \"" + lambdaName + "\"...")
  //console.log("Lauched!")

  
  const awsClient = new AwsClientsWrapper( awsProfile, env );
  //awsClient._invokeCommand(lambdaName,"RequestResponse","{}")

}

lambda_start_stop_env()

