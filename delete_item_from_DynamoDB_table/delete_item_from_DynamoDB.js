//-------------------------------------------------

const { AwsClientsWrapper } = require('pn-common');
const { readFileSync, mkdirSync, existsSync } = require('fs');
const { dirname } = require('path');
const { inspect, parseArgs } = require('util');
const { marshall } = require('@aws-sdk/util-dynamodb');

const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];
const VALID_ACCOUNT = ['core', 'confinfo'];

/**
 * Validates command line arguments
 * @returns {Object} Parsed and validated arguments
 */
function validateArgs() {
    const usage = `
Usage: node delete_item_from_DynamoDB.js --accountType|-a <AWSAccount> --envName|-e <environment> --tableName|-t <tableName> --inputFile|-f <path>

Description:
    Allows you to bulk delete rows from a DynamoDB table starting from an input JSON file.

Parameters:
    --accountType, -a Required. Account were is located the table (core|confinfo)
    --envName, -e     Required. Environment to check (dev|uat|test|prod|hotfix)
    --tableName, -t   Required. Table where to delete rows
    --inputFile, -f   Required. Path to the DynamoDB input file with the items to delete
    --help, -h        Display this help message

Example:
    node delete_item_from_DynamoDB.js --accountType core --envName dev --tableName pn-PaperRequestError --inputFile ./input.json`;

    const args = parseArgs({
        options: {
            accountType: { type: 'string', short: 'a' },
            envName: { type: 'string', short: 'e' },
            tableName: { type: 'string', short: 't' },
            inputFile: { type: 'string', short: 'f' },
            help: { type: 'boolean', short: 'h' }
        },
        strict: true
    });

    if (args.values.help) {
        console.log(usage);
        process.exit(0);
    }

    if (!args.values.envName || !args.values.inputFile) {
        console.error('Error: Missing required parameters');
        console.log(usage);
        process.exit(1);
    }

    if (!VALID_ENVIRONMENTS.includes(args.values.envName)) {
        console.error(`Error: Invalid environment. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
        process.exit(1);
    }

    if (!VALID_ACCOUNT.includes(args.values.accountType)) {
        console.error(`Error: Invalid AWS Account. Must be one of: ${VALID_ACCOUNT.join(', ')}`);
        process.exit(1);
    }

    return args;
};

/**
 * Extracting PartitionKey and ShortKey
 * @param {AwsClientsWrapper} clientDB
 * @param {string} tableName - Name of the table to delete
 * @return {Array} Array with PartitionKey and ShortKey
 */
async function retrievePkAndSk(clientDB, tableName) {
    const describeTable = await clientDB._describeTable(tableName);
    let PK;
    let SK;

    for (const item of describeTable.Table.KeySchema) {
        if (item.KeyType === 'HASH') PK = item.AttributeName;
        if (item.KeyType === 'RANGE') SK = item.AttributeName;
    };
    return {
        PK: PK,
        SK: SK
    };
};

/**
 * Process input file
 * @param {string} inputFile - Path to input file
 * @returns {Array} Array of parsed entries
 * @returns {string} lines to delete
 */
function readJson(inputFile) {
    let fileRows = readFileSync(inputFile, 'utf-8');
    let progress = 0;
    fileRows = fileRows.split('\n').filter(Boolean);
    const row = fileRows.length;
    for (let i = 0; i < fileRows.length; i++) {
        progress++;
        process.stdout.write(`\rRead item ${progress} of ${row}`);
        fileRows[i] = (JSON.parse(fileRows[i]));
    };
    return [fileRows,progress];
};

/**
 * Group elements into blocks of 25 elements and store these blocks in an overall object
 * @param {Array} itemsToDelete - Array of parsed entries
 * @param {Array} keys - Array with PartitionKey and ShortKey
 * @returns {Array} Array of blocks of 25 entries
 */
function itemGrouper(itemsToDelete, keys) {
    let allBlocksOfItems = [];
    let rows = 0;

    // group itemsToDelete into blocks of 25 items
    while (itemsToDelete.length > 0) {
        let singleBlockOfItems = [];
        itemsToDelete.slice(0, 25).forEach(row => {
            let key = {
                [keys.PK]: row[keys.PK],
                [keys.SK]: row[keys.SK]
            };
            singleBlockOfItems.push({
                DeleteRequest: {
                    Key: marshall(key)
                }
            });
            rows++;
        });
        
        allBlocksOfItems.push(singleBlockOfItems);
        itemsToDelete.splice(0, 25);
    };
    
    return (allBlocksOfItems);
};

/**
 * Appends a JSON object as a new line to a file
 * @param {string} outputFile - Target file path
 * @param {object} rnd - JSON data to append (row not deleted)
 */
function appendJsonToFile(outputFile, rnd) {
    // Create directory if it doesn't exist
    const dir = dirname(outputFile);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    // Append JSON string with newline
    appendFileSync(outputFile, JSON.stringify(rnd, null, 2) + '\n', (err));
    return (err);
}

async function main() {
    // Parse and validate arguments
    const args = validateArgs();
    const { accountType, envName, tableName, inputFile } = args.values;

    // Initialize AWS client
    const clientDB = new AwsClientsWrapper(accountType, envName);
    clientDB._initDynamoDB();

    // Extracting PartitionKey and ShortKey
    const keys = await retrievePkAndSk(clientDB, tableName);
    console.log('Keys of the ' + tableName + ' table');
    console.log(keys);
    console.log('\n');

    // Process input file
    const [itemsToDelete, progress] = readJson(inputFile);

    // Group elements into blocks of 25 elements and store these blocks in an overall object
    const allBlocksOfItems = itemGrouper(itemsToDelete, keys);
    
    let run = 0;
    let linesDeleted = 0;
    let result = [];
    for (block of allBlocksOfItems) {
        try {
            result = await clientDB._batchWriteItem(tableName, allBlocksOfItems[run]);
            if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
                try {
                    appendJsonToFile('results/item_not_deleted.json', result.UnprocessedItems);
                    console.log('\n');
                    console.log('\nUndeleted items in block ' + run + ' saved successfully in ' + outputFile);
                } catch (err) {
                    console.log('\n');
                    console.error('\nError creating JSON file:', err);
                }
            } else {
                console.log('\n');
                console.log('\nAll ' + allBlocksOfItems[run].length + ' elements of block ' + run + ' have been successfully deleted');
                linesDeleted = linesDeleted + allBlocksOfItems[run].length;
            }
        } catch (err) {
            console.log('\n');
            console.error('\nError while deleting ' + allBlocksOfItems[run].length + ' elements in the block ' + run, JSON.stringify(err, null, 2));
        }
        run++
    };
    //console.log(inspect(allBlocksOfItems, { showHidden: false, depth: null, colors: true }));
    console.log('\n');
    console.log('Number of runs performed --> ' + allBlocksOfItems.length + ' of ' + run);
    console.log('Number of lines deleted --> ' + linesDeleted + ' of ' + progress);
};

main();
