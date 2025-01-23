const { AwsClientsWrapper } = require("pn-common");
const { parseArgs } = require('util');

async function lambda_start_stop_env() {

  const args = [
    { name: "account_type", mandatory: true, subcommand: [] },
    { name: "region", mandatory: false, subcommand: [] },
    { name: "env", mandatory: true, subcommand: [] },
    { name: "action", mandatory: true, subcommand: [] }
  ]
 
   
  const parsedArgs = { values: { account_type, region, env, action }}
  = parseArgs({ options: {
   	account_type: {type: "string",short: "a"},
   	region: {type: "string", short: "r"},
   	env: {type: "string",short: "e"},
   	action: {type: "string",short: "d"}
    	}
  });
  

  function _checkingParameters(args, parsedArgs){
    const usage = "Usage: node lambda_start_stop_env.js --account_type <aws-profile> " +
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


    // Verifica dei valori degli argomenti passati allo script
    function isOkValue(argName,value,ok_values){
        if(!ok_values.includes(value)) {
        console.log("Error: \"" + value + "\" value for \"--" + argName + 
		"\" argument is not available, it must be in [" + ok_values + "]\n");
        process.exit(2);
        }
    }

    // Valori accettabili per le variabili:
    const account_types = ["core","confinfo"];
    const actions = ["Start","Stop"];
    const envs = ["dev","test","hotfix","uat"];

    isOkValue("account_type",account_type,account_types);
    isOkValue("action",action,actions);
    isOkValue("env",env,envs);

  }  
  
  _checkingParameters(args, parsedArgs)

  const lambdaName = "Lambda-Ecs-" + action + "-" + env 
  console.log("Launching lambda \"" + lambdaName + "\"...")
  
  const awsClient = new AwsClientsWrapper(account_type, env);
  awsClient._initLambda();
  const response = await awsClient._invokeCommand(lambdaName,"RequestResponse","{}")
  return response
}

lambda_start_stop_env()

