const fs = require('fs')
const { pem2jwk } = require('pem-jwk')
const { parseArgs } = require('util');

function _checkingParameters(args, values){
    const usage = "Usage: generate-jwks.js --publicKey <publicKey> --kid <kid>"

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
    { name: "publicKey", mandatory: true },
    { name: "kid", mandatory: true },
  ]
const values = {
    values: { publicKey, kid },
  } = parseArgs({
    options: {
        publicKey: { type: "string" },
        kid: { type: "string" },
    },
});  

_checkingParameters(args, values)

const pub = fs.readFileSync(publicKey, 'utf8');
const jwk = pem2jwk(pub)
jwk.kid = kid
jwk.alg = 'RS256'
jwk.use = 'sig'

const jwks = {
    keys: [
        jwk
    ]
}

console.log(JSON.stringify(jwks, null, 2))