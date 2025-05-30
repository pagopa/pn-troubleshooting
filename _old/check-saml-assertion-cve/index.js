const fs = require('fs')
const xpath = require('xpath')
const { DOMParser } = require('xmldom')


const folder = './assertions'

const files = fs.readdirSync(folder)

const decryptUtil = require('./decrypt')
const privateKey = fs.readFileSync('./private.pem')

// https://github.com/node-saml/xml-crypto/security/advisories/GHSA-x3m8-899r-f7c3
function verifyCVE_2025_29775(decryptedDocument){
    const digestValues = xpath.select(
        "//*[local-name()='DigestValue'][count(node()) > 1]",
        decryptedDocument,
    );
    
    if (digestValues.length > 0) {
        return true
    }

    return false
}

function verifySignature(signatureNode){
    // This check is per-Signature node, not per-document
    const signedInfoNodes = xpath.select(".//*[local-name(.)='SignedInfo']", signatureNode);
    
    if (signedInfoNodes.length === 0) {
        // Not necessarily a compromise, but invalid. Should contain exactly one SignedInfo node
        // Yours to implement
        return true;
      }
      
      if (signedInfoNodes.length > 1) {
        // Compromise detected, yours to implement
        return true;
      }
}

// https://github.com/node-saml/xml-crypto/security/advisories/GHSA-9p8x-f768-wp2g
function verifyCVE_2025_29774(decryptedDocument){
    const signatureNodes = xpath.select("//*[local-name(.)='Signature']", decryptedDocument);

    for (const signatureNode of signatureNodes) {
        
        if(verifySignature(signatureNode)){
            return true
        }
    }

    return false;
    
}

const reports = []


files.forEach(file => {
    console.log('file '+file)
    const data = fs.readFileSync(`${folder}/${file}`, 'utf8')
    const parseData = JSON.parse(data)

    const decryptedResponse = decryptUtil.toPlainText(privateKey, parseData.encryptedResponsePayload)
    
    // it is an xml
    const docRes = new DOMParser().parseFromString(decryptedResponse)

    const reportLine = {
        file: file
    }
    console.log('Analyzing '+file)

    if(decryptedResponse.indexOf('<!--')>=0){
        console.log('CVE_2025_29775 detected (comment) for assertion '+file)
        reportLine.file.cve1Comment = true
    }

    if(verifyCVE_2025_29775(docRes)){
        console.log('CVE_2025_29775 detected for assertion '+file)
        reportLine.cve1Res = true
    } else {
        reportLine.cve1Res = false
    }

    if(verifyCVE_2025_29774(docRes)){
        console.log('CVE_2025_29774 detected for assertion '+file)
        reportLine.cve2Res = true
    } else {
        reportLine.cve2Res = false
    }

    if(reportLine.cve1Comment || reportLine.cve1Res || reportLine.cve2Res){
        reportLine.compromised = true
    } else {
        reportLine.compromised = false
    }
    
    reports.push(reportLine)

})

fs.writeFileSync('report.json', JSON.stringify(reports)) 