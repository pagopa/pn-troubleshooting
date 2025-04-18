//-------------------------------------------------

const { AwsClientsWrapper } = require('pn-common');
const { dirname } = require('path');
const { parseArgs } = require('util');
const { fs, readFileSync, mkdirSync, existsSync, appendFileSync } = require('fs');
const { marshall } = require('@aws-sdk/util-dynamodb');

const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];

/**
 * Validates command line arguments
 * @returns {Object} Parsed and validated arguments
 */
function validateArgs() {
    const usage = `
Usage: node index2.js --envName|-e <environment> --inputFile|-f <path>

Description:
    Given a list of Json (the output of index1.js) the script insert into the table pn-PaperEvents.

Parameters:
    --envName, -e     Required. Environment to check (dev|uat|test|prod|hotfix)
    --inputFile, -f   Required. Path to the file utput of index1.js
    --help, -h        Display this help message

Example:
    node index2.js --envName dev --inputFile ./input.json`;

    const args = parseArgs({
        options: {
            envName: { type: 'string', short: 'e' },
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
    return args;
};

/**
 * Process input file
 * @param {string} inputFile - Path to input file
 * @returns {Array} Array of parsed entries
 */
function readJson(inputFile) {
    let fileRows = readFileSync(inputFile, 'utf8');
    const jsonArray = JSON.parse(fileRows);
    return (jsonArray);
};

/**
 * Group elements into blocks of 25 elements and store these blocks in an overall object
 * @param {Array} itemsToInsert - Array of parsed entries
 * @param {Array} keys - Array with PartitionKey and ShortKey
 * @returns {Array} Array of blocks of 25 entries
 */
function itemGrouper(itemsToInsert) {
    let allBlocksOfItems = [];
    let rows = 0;

    // group itemsToInsert into blocks of 25 items
    while (itemsToInsert.length > 0) {
        let singleBlockOfItems = [];
        itemsToInsert.slice(0, 25).forEach(row => {
            singleBlockOfItems.push({
                PutRequest: {
                    Item: marshall(row)
                }
            });
            rows++;
        });
        allBlocksOfItems.push(singleBlockOfItems);
        itemsToInsert.splice(0, 25);
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
};

async function main() {
    // Parse and validate arguments
    const args = validateArgs();
    const {envName, inputFile } = args.values;

    // Initialize AWS client
    const clientDB = new AwsClientsWrapper('core', envName);
    clientDB._initDynamoDB();

    // Process input file
    const itemsToInsert = readJson(inputFile);
    const tot = itemsToInsert.length;

    // Group elements into blocks of 25 elements and store these blocks in an overall object
    const allBlocksOfItems = itemGrouper(itemsToInsert);
    
    let run = 0;
    let linesInserted = 0;
    let result = [];
    for (block of allBlocksOfItems) {
        try {
            result = await clientDB._batchWriteItem('pn-PaperEvents', allBlocksOfItems[run]);
            if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
                try {
                    appendJsonToFile('results/item_not_inserted.json', result.UnprocessedItems);
                    console.log('\n');
                    console.log('\nUninserted items in block ' + run + ' saved successfully in ' + outputFile);
                } catch (err) {
                    console.log('\n');
                    console.error('\nError creating JSON file:', err);
                }
            } else {
                console.log('\n');
                console.log('\nAll ' + allBlocksOfItems[run].length + ' elements of block ' + run + ' have been successfully inserted');
                linesInserted = linesInserted + allBlocksOfItems[run].length;
            }
        } catch (err) {
            console.log('\n');
            console.error('\nError while inserting ' + allBlocksOfItems[run].length + ' elements in the block ' + run, JSON.stringify(err, null, 2));
        }
        run++
    };
    
    console.log('\n');
    console.log('Number of runs performed --> ' + allBlocksOfItems.length + ' of ' + run);
    console.log('Number of rows inserted --> ' + linesInserted + ' of ' + tot);
};

main();

