const axios = require('axios');

async function requestToExternalChannel(requestId, data){

    let url = process.env.ALB_BASE_URL+'/external-channel/gestoreRepository/requests/' + requestId;
    let headers = {
        'x-pagopa-extch-cx-id': 'pn-cons-000',
        'Content-Type': 'application/json'
    };
    
    let response = await axios.patch(url, data, { headers });
    return response.data;
}

const ApiClient = {
    requestToExternalChannel
}

exports.ApiClient = ApiClient;