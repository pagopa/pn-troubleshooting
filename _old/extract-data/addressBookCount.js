import { fromIni, fromSSO } from "@aws-sdk/credential-providers";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { DynamoDB } from "@aws-sdk/client-dynamodb";

const ADDR_TYPE = ["COURTESY#default#APPIO","COURTESY#default#EMAIL","COURTESY#default#SMS","LEGAL#default#PEC"];

const cmdLineArgs = process.argv ;

if(cmdLineArgs.length<=2){
  console.error("Specify AWS profile as argument")
  process.exit(1)
}

const awsProfile = cmdLineArgs[2]

console.log("Using profile " + awsProfile)

let config = null

process.env.AWS_SDK_LOAD_CONFIG=1
if(awsProfile.indexOf('sso_')>=0){ // sso profile
  console.log("Using profile SSO");
  config = { credentials: fromSSO({profile:awsProfile}), region: "eu-south-1" };
} else { // IAM profile
  config = { credentials: fromIni({profile:awsProfile}), region: "eu-south-1" };
}

const tableName = 'pn-UserAttributes'; // Sostituisci con il nome della tua tabella
const filterKey = 'sk'; // Sostituisci con il nome del tuo attributo di chiave primaria
//const filterValue = 'LEGAL#default#PEC'; // Sostituisci con il valore da filtrare

async function countItemsWithFilterExclusiveStartKey(filterValue, startKey) {
  const dynamoDB = DynamoDBDocument.from(new DynamoDB(config));

  const params = {
    TableName: 'pn-UserAttributes',
    FilterExpression: `#${filterKey} = :value`,
    ExpressionAttributeNames: {
      [`#${filterKey}`]: filterKey,
    },
    ExpressionAttributeValues: {
      ':value': filterValue,
    },
    Select: 'COUNT', // Seleziona solo il conteggio degli item
    ExclusiveStartKey: startKey, // Imposta l'ultimo elemento della pagina precedente come chiave di partenza per la pagina successiva
  };

  try {
    const response = await dynamoDB.scan(params);
    const itemCount = response.Count;
    //console.log(`- Numero di item nella tabella '${tableName}' con ${filterKey} uguale a '${filterValue}': ${itemCount}`);
    // Se la risposta ha un valore di LastEvaluatedKey, significa che ci sono altre pagine da recuperare
    if (response.LastEvaluatedKey) {
      // Recupera la pagina successiva utilizzando ricorsione
      return itemCount + await countItemsWithFilterExclusiveStartKey(filterValue, response.LastEvaluatedKey);
    }
    return itemCount;
  } catch (error) {
    console.error('Errore durante il conteggio degli item:', error);
    throw error;
  }
}

async function countItemsWithFilter(filterValue) {
  console.log(`Numero di item nella tabella '${tableName}' con ${filterKey} uguale a '${filterValue}'`);
  const itemCount = await countItemsWithFilterExclusiveStartKey(filterValue, undefined);
  console.log(`Numero di item nella tabella '${tableName}' con ${filterKey} uguale a '${filterValue}': ${itemCount}`);
}

// Utilizzo dell'esempio
ADDR_TYPE.forEach(countItemsWithFilter);





