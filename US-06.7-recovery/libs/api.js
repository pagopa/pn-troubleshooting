const axios = require('axios');
const https = require('https');

const agent = new https.Agent({  
  rejectUnauthorized: process.env.AGENT
});


async function requestToOpensearch(data){
    let url = process.env.BASE_URL+'/pn-logs*/_search';
    let response = await axios.post(url, data, {
        auth: {
          username: process.env.USERNAME,
          password: process.env.PASSWORD,
        },
        httpsAgent: agent 
      });
    return response.data;
}

const ApiClient = {
    requestToOpensearch
}

exports.ApiClient = ApiClient;