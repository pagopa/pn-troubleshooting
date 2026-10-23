const axios = require('axios');

async function sendNationalRegistriesRequest(taxId, correlationId, receiverType, domicileType, referenceRequestDate){

    let url = process.env.ALB_BASE_URL+'/national-registries-private/'+receiverType+'/addresses';
    let headers = {
        'pn-national-registries-cx-id': 'pn-support',
        'Content-Type': 'application/json'
    };
    let data = {
        "filter": {
            "taxId": taxId,
            "referenceRequestDate": referenceRequestDate,
            "correlationId": correlationId,
            "domicileType": domicileType
        }
    };

    console.log(`Sending request to ${url} with data: ${JSON.stringify(data)}`)
    let response = await axios.post(url, data, { headers });
    return response.data;
}

async function sendInadRequest(taxId, practicalReference, receiverType) {
    const url = process.env.ALB_BASE_URL + '/national-registries-private/' + receiverType + '/inad/digital-address';
    const headers = {
        'pn-national-registries-cx-id': 'pn-support',
        'Content-Type': 'application/json'
    };
    const data = {
        filter: { taxId, practicalReference }
    };

    console.log(`Sending INAD request with practicalReference ${practicalReference}`)
    const response = await axios.post(url, data, { headers });
    return response.data;
}

const ApiClient = {
    sendNationalRegistriesRequest,
    sendInadRequest
}

exports.ApiClient = ApiClient;