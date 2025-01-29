// Required imports
import { parseArgs } from 'util';
import { parse } from 'csv-parse';
import { readFileSync } from 'fs';
import axios from 'axios';

// Validation constants
const USAGE = `
Usage: node update-retention-dates.js --csvFile <path-to-csv>

Description:
    Updates retention dates for SafeStorage documents by adding 1 hour.

Parameters:
    --csvFile, -f    Required. Path to the CSV file containing document metadata
    --help, -h       Display this help message
`;

// API client implementation
const ApiClient = {
    async requestToSafeStorage(fileKey, data) {
        const url = `${process.env.BASE_URL}/safe-storage/v1/files/${fileKey}`;
        const headers = {
            'x-pagopa-safestorage-cx-id': 'pn-delivery',
            'Content-Type': 'application/json'
        };
        
        const response = await axios.post(url, data, { headers });
        return response.data;
    }
};

/**
 * Parses command line arguments
 * @returns {Object} Parsed arguments
 */
function validateArgs() {
    const args = parseArgs({
        options: {
            csvFile: { type: "string", short: "f" },
            help: { type: "boolean", short: "h" }
        },
        strict: true
    });

    if (args.values.help) {
        console.log(USAGE);
        process.exit(0);
    }

    if (!args.values.csvFile) {
        console.error("Error: Missing required parameter --csvFile");
        console.log(USAGE);
        process.exit(1);
    }

    return args.values;
}

/**
 * Parses CSV file and returns array of records
 * @param {string} filePath Path to CSV file
 * @returns {Promise<Array>} Parsed records
 */
function parseCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        const fileContent = readFileSync(filePath, 'utf-8');
        
        parse(fileContent, {
            columns: true,
            delimiter: ',',
            trim: true
        })
        .on('data', (data) => results.push(data))
        .on('error', (err) => reject(err))
        .on('end', () => resolve(results));
    });
}

/**
 * Updates retention date by adding 1 hour
 * @param {string} dateString ISO date string
 * @returns {string} Updated ISO date string
 */
function increaseRetentionDate(dateString) {
    const date = new Date(dateString);
    date.setHours(date.getHours() + 1);
    return date.toISOString();
}

/**
 * Main execution function
 */
async function main() {
    try {
        // Parse command line arguments
        const { csvFile } = validateArgs();

        // Parse CSV file
        console.log('Parsing CSV file...');
        const records = await parseCSV(csvFile);
        console.log(`Found ${records.length} records to process`);

        // Process each record
        let processed = 0;
        for (const record of records) {
            const { documentKey, retentionUntil } = record;
            
            if (!documentKey || !retentionUntil) {
                console.warn('Skipping record - missing required fields:', record);
                continue;
            }

            try {
                // Calculate new retention date
                const newRetentionDate = increaseRetentionDate(retentionUntil);
                
                // Update metadata via API
                await ApiClient.requestToSafeStorage(documentKey, {
                    status: null,
                    retentionUntil: newRetentionDate
                });

                processed++;
                process.stdout.write(`\rProcessed ${processed}/${records.length} records`);
                
            } catch (error) {
                console.error(`\nError processing document ${documentKey}:`, error.message);
            }
        }

        console.log('\nProcessing complete!');
        console.log(`Successfully processed: ${processed}/${records.length} records`);

    } catch (error) {
        console.error('Fatal error:', error.message);
        process.exit(1);
    }
}

// Start execution
main().catch(console.error);