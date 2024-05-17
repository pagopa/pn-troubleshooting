const axios = require('axios');

// with PF or PG prefix
async function decodeUID(uid, baseUrl, apiKey){
    // if uid prefix is PF-
    if(uid.startsWith('PF-')){
        const pfUid = uid.substring(3);
        let url = baseUrl+'/tokenizer/v1/tokens/'+pfUid+'/pii?fl=familyName&fl=fiscalCode';
        const headers = {
            'x-api-key': apiKey,
        };
        let response = await axios.get(url, { headers });
        return response.data;        
    } else if(uid.startsWith('PG-')){
        const pgUid = uid.substring(3);
        // do the above request using axios
        let url = baseUrl+'/external/data-vault/v1/institutions/'+pgUid;
        const headers = {
            'Ocp-Apim-Subscription-Key': apiKey
        };
        let response = await axios.get(url, { headers });
        return response.data;        
    } else {
        throw new Error('Invalid UID prefix');
    }
}


async function callNr(cxId,fiscalCode, baseUrl){

    const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
    };

    if(cxId.startsWith('PG-')){
        let url = baseUrl+'/national-registries-private/registro-imprese/address';
        const body = {
            filter: {
                taxId: fiscalCode
            }
        } 
        let response = await axios.post(url,body, {headers});
        return response.data;        
    } else if(cxId.startsWith('PF-')){
        let url = baseUrl+'/national-registries-private/anpr/address';
        const body = {
            filter: {
                taxId: fiscalCode,
                referenceRequestDate: new Date().toISOString(),
                requestReason: "test-call"
            }
        } 
        let response = await axios.post(url,body, {headers});
        return response.data;                
    } else {
        throw new Error('Invalid UID prefix');
    }
}

const ApiClient = {
    decodeUID,
    callNr
}

exports.ApiClient = ApiClient;