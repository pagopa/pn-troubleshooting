const decryptUtil = require('./decrypt')
const fs = require('fs')
const path = require('path');

const privateKeyPath = process.argv[2]
const samleAssertionPath = process.argv[3]

console.log('PrivateKey Path: '+privateKeyPath)
console.log('SAML assertion path: '+samleAssertionPath)

const privateKey = fs.readFileSync(privateKeyPath)

const samlAssertion = fs.readFileSync(samleAssertionPath)

const jsonSamlAssertion = JSON.parse(samlAssertion)

const requestEncryptedPayload = jsonSamlAssertion.encryptedRequestPayload

const requestEncryptedPayloadPlain = decryptUtil.toPlainText(privateKey, requestEncryptedPayload)

console.log('REQ', requestEncryptedPayloadPlain)


const responseEncryptedPayload = jsonSamlAssertion.encryptedResponsePayload

const responseEncryptedPayloadPlain = decryptUtil.toPlainText(privateKey, responseEncryptedPayload)

console.log('RES', responseEncryptedPayloadPlain)

jsonSamlAssertion.decryptedRequest = requestEncryptedPayloadPlain
jsonSamlAssertion.decryptedResponse = responseEncryptedPayloadPlain

const outputFile = path.basename(samleAssertionPath).replace('.json', '-decrypted.json')
fs.writeFileSync(outputFile, JSON.stringify(jsonSamlAssertion))