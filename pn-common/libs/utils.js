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

module.exports = { 
  sleep,
  _getIunFromRequestId,
  _getAttemptFromRequestId
};