const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function requestToPdfRaster(filePath){

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
  
    let url = process.env.BASE_PATH+'/PDFRaster/convert/';
    
    let response = await axios.post(url, form,  {
        headers: {
          ...form.getHeaders(),
        },
        responseType: 'stream'
      });
    return response.data;
}

const ApiClient = {
    requestToPdfRaster
}

exports.ApiClient = ApiClient;