const axios = require('axios');

async function callAddressManager(baseUrl, requestId, address){

    const headers = {
            'Content-Type' : 'application/json',
            'x-api-key' : '_',
            'pn-address-manager-cx-id' : 'pn-paper-channel'
    };
    
    let url = baseUrl+'/address-private/deduplicates';
    let body = {
        correlationId: "NRG_ADDRESS_"+requestId,
        baseAddress: address,
        targetAddress: address
    } 

              
    try{
        console.log(url, body, {headers})
        let response = await axios.post(url, body, {headers});
        return response.data;
    }catch(error){
        console.error("Call address manager error ",error);
    }
    
}

const ApiClient = {
    callAddressManager
}

exports.ApiClient = ApiClient;