const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const { parseArgs } = require('util');
const { exec } = require('child_process');
const fs = require('fs')

function _checkingParameters(args, values){
    const usage = "Usage: index.js --envName <env-name>"
    //CHECKING PARAMETER
    args.forEach(el => {
      if(el.mandatory && !values.values[el.name]){
        console.log("Param " + el.name + " is not defined")
        console.log(usage)
        process.exit(1)
      }
    })
  }

  
const args = [
    { name: "envName", mandatory: true, subcommand: [] }
  ]
  
const values = {
        values: { envName },
    } = parseArgs({
        options: {
            envName: {
            type: "string", short: "e", default: undefined
            }
        },
    });  

_checkingParameters(args, values)

const awsCoreProfile = "sso_pn-core-" + envName
const awsConfinfoProfile = "sso_pn-confinfo-" + envName
const coreCredentials = fromSSO({ profile: awsCoreProfile })();
const coreSSMClient = new SSMClient({
    credentials: coreCredentials,
    region: 'eu-south-1'
});

async function run(){
    fs.readFile("./certificate.json", "utf8", (err, jsonString) => {
        if (err) {
          console.log("Error reading file from disk:", err);
          return;
        }
        try {
          const parameters = JSON.parse(jsonString);
          parameters.forEach(async (cert)=> {
            const input = {
                Name: cert.cert_name,
                WithDecryption: true
            }
            const command = new GetParameterCommand(input);
            const res = await coreSSMClient.send(command)
            const decodedData = Buffer.from(JSON.parse(res.Parameter?.Value).cert, 'base64').toString('utf-8');
            const filePath = './' + cert.cert_name.split("/")[cert.cert_name.split("/").length-1] + '.crt';
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            fs.writeFile(filePath, decodedData, { flag: 'wx' },  err => {
                if (err) {
                    fs.unlinkconsole.error(err);
                    console.log(err)
                }
                exec("openssl x509 -noout -enddate -in " + filePath, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Errore durante l'esecuzione del comando: ${error}`);
                        return;
                    }
                    console.log(`Il Certificato ${cert.cert_name}.crt scade in data: ${stdout.split("=")[stdout.split("=").length-1]}`);
                    fs.unlinkSync(filePath);
                })
                
            });
          })
        } catch (err) {
          console.log("Error parsing JSON string:", err);
        }
      });
}
run()