const decryptUtil = require('./decrypt')
const fs = require('fs')
const path = require('path');

const privateKeyPath = process.argv[2]
const samlAssertionPath = process.argv[3]

console.log('PrivateKey Path: '+privateKeyPath)
console.log('SAML assertion path: '+samlAssertionPath)

const privateKey = fs.readFileSync(privateKeyPath)

const samlAssertion = fs.readFileSync(samlAssertionPath)

const jsonSamlAssertion = JSON.parse(samlAssertion)

const requestEncryptedPayload = jsonSamlAssertion.encryptedRequestPayload

const requestEncryptedPayloadPlain = decryptUtil.toPlainText(privateKey, requestEncryptedPayload)

const responseEncryptedPayload = jsonSamlAssertion.encryptedResponsePayload

const responseEncryptedPayloadPlain = decryptUtil.toPlainText(privateKey, responseEncryptedPayload)

jsonSamlAssertion.decryptedRequest = requestEncryptedPayloadPlain
jsonSamlAssertion.decryptedResponse = responseEncryptedPayloadPlain

const outputFile = samlAssertionPath.replace('.json', '-decrypted.json')
fs.writeFileSync(outputFile, JSON.stringify(jsonSamlAssertion))