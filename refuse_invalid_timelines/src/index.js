const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { jq } = require('jq.node')

function validationAttemptsAreMoreThenOne( row ) {
  let attemptNumber = parseInt(row.details.M.retryAttempt.N);
  return attemptNumber > 1;
}

function getNotificationFileKeys( n ) {
  let docKeys = n.documents.L.map( el => el.M.ref.M.key.S);
  let paymentKeys = n.recipients.L.map( el => el.M.payments.L.map( p => p.M.pagoPaForm.M.ref.M.key.S));
  return [ docKeys, paymentKeys ].flat( 3 );
}

async function main() {
  const envName = 'dev';
  const SAFE_STORAGE_BUCKET = 'pn-safestorage-eu-south-1-089813480515';
  
  const awsClient = new AwsClientsWrapper( envName ); // FIXME parametrizzare profilo e regione
  
  try {
    const validations = await awsClient.failingNotificationPage();
    
    const interestingValidations = validations.filter( validationAttemptsAreMoreThenOne );
    
    const iuns = interestingValidations.map( row => row.iun.S)

    for( let i = 0 ; i < iuns.length; i++ ) {
      console.log( `` )
      
      const iun = iuns[ i ];
      console.log( `== Check notification ${i} of ${iuns.length}  with iun ${iun}` )

      const notification = await awsClient.getNotification( iun );
      const fileKeys = getNotificationFileKeys( notification );

      for( let f = 0 ; f < fileKeys.length; f++ ) {
        const fileKey = fileKeys[ f ];

        let exists = await awsClient.checkS3Exists( SAFE_STORAGE_BUCKET , fileKey )
        console.log( `    File ${fileKey} exist ? ${ exists ? 'yes' : 'NO!'}` )
        
        if( ! exists ) {
          await awsClient.putRefusingTimeline( 
            iun, 
            notification.recipients.L.length, 
            fileKey, 
            notification.sentAt.S, 
            notification.senderPaId.S
          );

          await awsClient.removeFutureActions( iun );
          
          console.log("    REFUSE NOTIFICATION !!");
          break;
        } 
      }
    }

  }
  catch( error ) {
    console.error( error );
  }

}

main();
