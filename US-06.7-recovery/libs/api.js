const axios = require('axios');
const https = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const agent = new https.Agent({  
  rejectUnauthorized: false
});


async function requestToOpensearch(data){
    let url = process.env.BASE_URL+'/pn-logs*/_search';
    console.log(url)
    console.log(JSON.stringify(data))
    let response = await axios.post(url, data, {
        auth: {
          username: process.env.USERNAME,
          password: process.env.PASSWORD,
        },
        httpsAgent: agent 
      });
    console.log(response.data)
    return response.data;
}

const ApiClient = {
    requestToOpensearch
}

exports.ApiClient = ApiClient;