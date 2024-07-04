async function sleep( ms ) {
    return new Promise( ( accept, reject) => {
      setTimeout( () => accept(null) , ms );
    })
  }
  
  module.exports = { 
    sleep
  };