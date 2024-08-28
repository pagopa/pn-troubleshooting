const axios = require('axios');

async function requestToDelivery(data){

    let url = process.env.ALB_BASE_URL+'/delivery-private/notifications/update-status';
    let response = await axios.post(url, data);
    return response.data;
}

const ApiClient = {
    requestToDelivery
}

exports.ApiClient = ApiClient;