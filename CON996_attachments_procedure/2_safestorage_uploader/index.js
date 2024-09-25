const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const inputFile = process.argv[2];
const cacheFile = process.argv[3];

if(process.argv.length < 4){
    console.error('Usage: node index.js <inputFile> <cacheFile>');
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

// start tunnel https://pagopa.atlassian.net/wiki/spaces/PN/pages/706183466/Bastion+Host+SSM
const safeStorageUrl = "http://localhost:8080";

function computeSha256Base64(filePath) {
    // Read the file in binary mode
    const fileBuffer = fs.readFileSync(filePath);

    // Compute the SHA-256 hash
    const sha256Hash = crypto.createHash('sha256').update(fileBuffer).digest();

    // Encode the hash in Base64
    const base64EncodedHash = sha256Hash.toString('base64');

    return base64EncodedHash;
}

async function uploadToS3(pdfFilePath){
    const body = {
        contentType: 'application/pdf',
        documentType: 'PN_NOTIFICATION_ATTACHMENTS',
        status: 'PRELOADED'
    }

    const sha256 = computeSha256Base64(pdfFilePath);   
    const response = await fetch(`${safeStorageUrl}/safe-storage/v1/files`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json', 
            'x-checksum': 'SHA-256',
            'x-checksum-value': sha256,
            'x-pagopa-safestorage-cx-id': 'pn-delivery'
        },
        body: JSON.stringify(body)
    })

    const data = await response.json();
    
    const uploadUrl = data.uploadUrl;
    const fileKey = data.key;
    const secret = data.secret;

    // upload pdfFilePath using PUT to uploadUrl
    
    const fileContent = fs.readFileSync(pdfFilePath);
    const uploadRequestParams = {
        method: 'PUT',
        body: fileContent,
        headers: {
            'Content-Type': 'application/pdf',
            'x-amz-checksum-sha256': sha256,
            'x-amz-meta-secret': secret,
        }
    }

    const uploadResponse = await fetch(uploadUrl, uploadRequestParams)

    if(uploadResponse.status !== 200){
        throw new Error('Upload failed for key '+fileKey+' with status '+uploadResponse.status);
    }

    if(uploadResponse.status !== 200){
        throw new Error('Upload failed for key '+fileKey+' with status '+uploadResponse.status);
    }
    return {
        fileKey,
        checksum: sha256
    }
}

async function getPresignedDownloadUrl(fileKey){
    const response = await fetch(`${safeStorageUrl}/safe-storage/v1/files/${fileKey}`, {
        method: 'GET',
        headers: {
            'x-pagopa-safestorage-cx-id': 'pn-delivery'
        }
    })

    const data = await response.json();
    
    return data.download.url;
}

// resolve base path from $2
const basePath = path.resolve(inputFile, '..') + '/';

const report = {
    
}
// data is an object with the following structure { key: value }
async function run() {
    // iterate on data
    for( let key in data){
        if(cacheData[key]){
            console.log('Skipping '+key);
            report[key] = cacheData[key];
            continue;
        }
        const pdfFilePath = data[key];
        const { fileKey, checksum } = await uploadToS3(basePath+pdfFilePath);
        const presignedDownloadUrl = await getPresignedDownloadUrl(fileKey);
        report[key] = {
            fileKey,
            key,
            checksum,
            date: new Date().toISOString(),
            pdfFilePath,
            url: presignedDownloadUrl
        }

        console.log(JSON.stringify(report[key], null, 2))
    }

}

run()
    .then(() => {
        console.log('Upload completed');
    })
    .catch((err) => {
        console.error(err);
    })
    .finally(() => {
        fs.writeFileSync('report.json', JSON.stringify(report, null, 2));
    })


