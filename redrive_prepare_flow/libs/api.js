const axios = require('axios');

async function sendNationalRegistriesRequest(taxId, correlationId, receiverType){

    let url = process.env.ALB_BASE_URL+'/national-registries-private/'+receiverType+'/addresses';
    let headers = {
        'pn-national-registries-cx-id': 'pn-paper-channel',
        'Content-Type': 'application/json'
    };
    let data = {
        "filter": {
            "taxId": taxId,
            "referenceRequestDate": new Date().toISOString(),
            "correlationId": correlationId,
            "domicileType": 'PHYSICAL'
        }
    };

    let response = await axios.post(url, data, { headers });
    return response.data;
}

// with PF or PG prefix
async function decodeUID(uid){
    let url = `${process.env.ALB_CONFIDENTIAL_URL}/datavault-private/v1/recipients/internal?internalId=${uid}`;
    console.log(url)
    let headers = {
        'Content-Type': 'application/json'
    };
    let response = await axios.get(url, { headers });
    return response.data[0];               
}

const ApiClient = {
    sendNationalRegistriesRequest,
    decodeUID
}

exports.ApiClient = ApiClient;