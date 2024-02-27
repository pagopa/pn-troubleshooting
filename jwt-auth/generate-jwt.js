const jwt = require('jsonwebtoken')
const fs = require('fs')
const { parseArgs } = require('util');


function _checkingParameters(args, values){
    const usage = "Usage: generate-jwt.js --privateKey <privateKey> --aud <aud> --iss <iss> --jti <jti> --kid <kid> --expiresIn <expiresIn>"

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
    { name: "privateKey", mandatory: true },
    { name: "aud", mandatory: true },
    { name: "iss", mandatory: true },
    { name: "jti", mandatory: true },
    { name: "kid", mandatory: true },
    { name: "expiresIn", mandatory: true },
  ]
const values = {
    values: { privateKey, aud, iss, jti, kid, expiresIn },
  } = parseArgs({
    options: {
        privateKey: { type: "string" },
        aud: { type: "string" },
        iss: { type: "string" },
        jti: { type: "string" },
        kid: { type: "string" },
        expiresIn: { type: "string" },
    },
});  

_checkingParameters(args, values)

const jwtBody= {
    aud,
    iss,
    jti,
}

const config = {
    key: fs.readFileSync(privateKey),       /* RSA */
}

const token = jwt.sign(jwtBody, config.key, { algorithm: 'RS256', keyid: kid, expiresIn: expiresIn});

console.log(token)