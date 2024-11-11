const fs = require('fs');
const { parse } = require('csv-parse');
const path = require('path');

async function sleep( ms ) {
    return new Promise( ( accept, reject) => {
      setTimeout( () => accept(null) , ms );
    })
  }
  
function _getIunFromRequestId(requestId) {
  return requestId.split("IUN_")[1].split(".")[0];
}

function _getAttemptFromRequestId(requestId) {
  return requestId.split("ATTEMPT_")[1][0];
}

function _parseCSV(fileName, delimiter) {
  return new Promise((resolve, reject) => {
    let results = [];
    const parser = fs.createReadStream(fileName).pipe(parse({
      columns: true, 
      delimiter: delimiter, 
      trim: true
    }));
    parser.on('data', (data) => {
      results.push(data)
    });
    parser.on('error', (err) => {
      reject(err);
    });
    parser.on('end', () => {
      resolve(results);
    });
  })
}

function appendJsonToFile(filePath, fileName, data){
  if(!fs.existsSync(filePath))
    fs.mkdirSync(filePath, { recursive: true });
  fs.appendFileSync(path.join(filePath, fileName), data + "\n")
}

module.exports = { 
  sleep,
  appendJsonToFile,
  _getIunFromRequestId,
  _getAttemptFromRequestId,
  _parseCSV
};