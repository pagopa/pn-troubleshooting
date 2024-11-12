const axios = require('axios');

async function decodeUIDs(uids){
    try {
        let url = `http://127.0.0.1:8888/datavault-private/v1/recipients/internal?${uids}`
        let response = await axios.get(url);
        return response.data;
    }
    catch {
        throw new Error('Invalid request', url);
    }
}

const ApiClient = {
    decodeUIDs
}

exports.ApiClient = ApiClient;