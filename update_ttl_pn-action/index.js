const { AwsClientsWrapper } = require("pn-common");
const { _parseCSV } = require("utils");

// ------------ Parametri input ---------------------
const accountType = "core"; // 207905393513 account id pn-core-hotfix
const env = "hotfix";
//const fileName = "./core_hotfix_pn-Actions-notBefore2024.csv"
const fileName = "./singleLine.csv"

// --------------------------------------------------

// Inizializzazione client DynamoDB
const dynDbClient = new AwsClientsWrapper(accountType,env);
dynDbClient._initDynamoDB();


function increaseFtuInput(val,pk,ftu,csvRow){ //ftu = fieldToUpdate
    const input = {};
    input.keys = { 
        [pk]: csvRow[pk] // valore della pk da csv 
     // [sk]: skVal // valore della sk da csv
    }; 
    input.values = {
        [ftu]: {
          codeAttr: '#' + [ftu], // Alias del campo da aggiornare
          codeValue: ':new' + [ftu], // Nome del nuovo valore da associare ad ftu
          // Devo parsare csvRow[ftu] in quanto valore numerico ottenuto dal file csv --> nasce come stringa 
            // e ottengo errori di calcolo
          value: parseInt(csvRow[ftu]) + ( val * 86400000 ) // Nuovo valore da associare al campo ftu
          /*
          keys                  --> { actionId: { S: 'valore actionId' } }
          Alias per ttl         --> { '#ttl': 'newttl' }
          Nuovo valore di TTL   -->{ ':newttl': { N: '<numero>' } }
          Espressione nuovo ttl --> SET  #ttl = :newTtl
          */
        }
      };
    return input;
};

async function main() {

    const tableName = "pn-Action";

    // _parseCSV Scarta automaticamente gli header ed elimina gli ""
    const parsedCsv = await _parseCSV(fileName,","); // array di oggetti
    
    for(const row of parsedCsv) {
        //ftu = fieldToUpdate
        // Attributo da incrementare ----------------|
        // PK --------------------------------|      |
        // gg da aggiuntere ----------|       |      |     
        let input = increaseFtuInput(1,"actionId","ttl",row);
        try {
            const result = await dynDbClient._updateItem(tableName, input.keys, input.values,'SET');
            console.log(result);
        } catch(e) {
            console.log(e);
        }
    };
};

main();