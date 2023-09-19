const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');

function _checkingParameters(args, values){
  const usage = "Usage: index.js --envName <env-name> --certificate <ade|infocamere> [--replace]"
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

async function _writeInFile(result, filename ) {
  fs.mkdirSync("backup", { recursive: true });
  fs.writeFileSync('backup/' + filename, result, 'utf-8')
}

async function _backup(value, type, format){
  Object.keys(value).forEach(async key => {
    const fileNameKey = type + key.replaceAll("/", "_") + "_" + new Date().toISOString() + "_" + envName 
    console.log(fileNameKey)
    await _writeInFile(value[key], fileNameKey + format)
  });
}

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "certificate", mandatory: true, subcommand: [] },
    { name: "replace", mandatory: false, subcommand: [] },
  ]
  const values = {
    values: { envName, certificate, replace },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      certificate: {
        type: "string", short: "c", default: undefined
      },
      replace: {
        type: "boolean", short: "b", default: false
      }
    },
  });  
  
  _checkingParameters(args, values)
  var certificateName = null;
  switch (certificate) {
    case 'ade':
      certificateName = '/pn-national-registries/ade-api-cert';
      break;
    case 'infocamere':
      certificateName = '/pn-national-registries/infocamere-cert';
      break;
  }
  if(!certificateName){
    console.error("Certificate param is not valid. Insert 'ade' or 'infocamere'.")
    process.exit(1);
  }

  const awsClient = new AwsClientsWrapper( envName );
  certificates = {}
  secrets = {}

  //FASE BACKUP
  certificates[certificateName] = await awsClient._getSSMParameter( certificateName )
  certificates[certificateName + "-next"] = await awsClient._getSSMParameter( certificateName + "-next" );
  await _backup(certificates, "cert", ".json")
  //parsing certificate 
  for (const key in certificates) {
    certificates[key] = JSON.parse(certificates[key])
    if(certificate.indexOf("ade")>0){
      secrets[certificates[key].secretid] = await awsClient._getSecretValue( certificates[key].secretid );
    }
  }
  await _backup(secrets, "secret", "")


  if( replace ){
    //FASE SOSTITUZIONE
    //Sostituisce certificato contenuto in <CertificateName> con <CertificateName>-Next
    console.log("Sostituisce certificato contenuto in <CertificateName> con <CertificateName>-Next")
    await awsClient._updateSSMParameter( certificateName, JSON.stringify(certificates[certificateName+"-next"]));

    if(certificate.indexOf("ade")>0){ 
      //Sostituisce il secret contenuto in <CertificateName>.secretId con <CertificateName>-next.secretId
      console.log("Sostituisce il secret contenuto in <CertificateName>.secretId con <CertificateName>-next.secretId")
      await awsClient._updateSecretValue( certificates[certificateName].secretid, secrets[certificates[certificateName+"-next"].secretid]);

      //Sostituisce il certificate <CertificateName> con <CertificateName> ma con secretId non next
      console.log("Sostituisce il certificate <CertificateName> con <CertificateName> ma con secretId non next")
      var certSecretIdUpdated = JSON.parse(JSON.stringify(certificates[certificateName+"-next"]))
      certSecretIdUpdated.secretid = certificates[certificateName].secretid
      await awsClient._updateSSMParameter( certificateName, JSON.stringify(certSecretIdUpdated));
    }
    else if (certificate.indexOf("infocamere")>0) {
      //Aggiornamento Alias che punta alla nuova Chiave
      console.log("Aggiornamento Alias che punta alla nuova Chiave")
      await awsClient._updateAlias("alias/pn-national-registries-infocamere-signing-key-alias", certificates[certificateName+"-next"].keyId)
    }
  }
}

main();