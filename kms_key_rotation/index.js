const { parseArgs } = require('util');
const { AwsClientsWrapper } = require("pn-common");

async function listSymmetricCloudformationKMS(awsClient) {
  console.log(`Getting Symmetric Key with tag cloudformation...`)
  const KMSList = []
  const res = await awsClient._listKeyCommand(200);
  for(const key of res.Keys) {
    const keyId = key.KeyId;
    try {
      const res = await awsClient._describeKeyCommand(keyId);
      if(res.KeyMetadata.KeySpec.startsWith("SYMMETRIC")) {
        const resTags = await awsClient._listResourceTags(keyId)
        if(resTags.Tags.length > 0) {
          for(const tag of resTags.Tags) {
            if(tag.TagKey.toLowerCase() == 'createdby' && tag.TagValue.toLowerCase() == 'cloudformation') {
              const res = await awsClient._getKeyRotationStatusCommand(keyId)
              if(!res.KeyRotationEnabled) {
                console.log(`Found key ${keyId}`)
                KMSList.push(keyId)
              }
            } 
          }
        }
      }
    }
    catch (e) {
      console.log(`Is not possible to get this kms information ${keyId}`)
    }
  }
  return KMSList
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --account <account> [--dryrun]"
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
    { name: "account", mandatory: true, subcommand: [] },
    { name: "dryrun", mandatory: false, subcommand: [] },
  ]
  const values = {
    values: { envName, account, dryrun },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      account: {
        type: "string", short: "a", default: undefined
      },
      dryrun: {
        type: "boolean", short: "d", default: undefined
      },
    },
  });  
  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( account, envName );
  awsClient._initKMS()
  const keyToGenerate = await listSymmetricCloudformationKMS(awsClient)
  for (const keyId of keyToGenerate) {
    console.log(`${keyId} starting rotation`)
    if(!dryrun) { 
      await awsClient._rotateKeyOnDemand(keyId)
    }
    console.log(`${keyId} rotated correctly`)
  }
}

main();