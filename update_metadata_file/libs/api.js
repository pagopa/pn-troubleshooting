const axios = require('axios');
require('dotenv').config()

async function requestToSafeStorage(fileKey, data){
    let url = process.env.BASE_URL + '/safe-storage/v1/files/' + fileKey;
    let headers = {
        'x-pagopa-safestorage-cx-id': 'pn-delivery-push',
        'Content-Type': 'application/json'
    };
    let response = await axios.post(url, data, { headers });
    return response.data;
}
const ApiClient = {
    requestToSafeStorage
}

exports.ApiClient = ApiClient;