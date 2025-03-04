const { AwsClientsWrapper } = require("pn-common");
const { parseArgs } = require('node:util');
const { open } = require('node:fs/promises');
const { openSync, closeSync, mkdirSync, appendFileSync } = require('node:fs');
const { join } = require('node:path');


// ------------ Input parameters ---------------------

async function main() {

    // <--- Input parameter ---
    const args = [
        { name: "region", mandatory: false },
        { name: "env", mandatory: false },
        { name: "srcAccountType", mandatory: false },
        { name: "srcBucket", mandatory: true },
        { name: "dstAccountType", mandatory: false },
        { name: "dstBucket", mandatory: true },
        { name: "fileName", mandatory: true },
        { name: "startFileKey", mandatory: false }
    ];

    const parsedArgs = { values: { region, env, srcAccountType, srcBucket, dstAccountType, dstBucket, fileName, startFileKey } } = parseArgs(
        {
            options: {
                region: { type: "string", short: "r", default: "eu-south-1" },
                env: { type: "string", short: "e"},
                srcAccountType: { type: "string", short: "a" },
                srcBucket: { type: "string", short: "b" },
                dstAccountType: { type: "string", short: "A" },
                dstBucket: { type: "string", short: "B" },
                fileName: { type: "string", short: "f" },
                startFileKey: { type: "string", short: "k" }
            }
    });
    // --- Input parameter --->

    // <--- Functions ---
    function _checkingParameters(args, parsedArgs) {

        const usage = "\nUsage:\n\nnode index.js \\\n" +
            "\t[--region <region>] \\\n\t[--env <ambiente src/dst>] \\\n" +
            "\t[--srcAccountType <profile>] \\\n\t--srcBucket <soure bucket name> \\\n" +
            "\t[--dstAccountType <profile>] \\\n\t--dstBucket <destination bucket name> \\\n" +
            "\t--filename <file> \\\n\t[--startFileKey <FileKey>]\n";

        // Verifica se un argomento è stato inserito oppure inserito con valore vuoto
        args.forEach(el => {
            if (el.mandatory && !parsedArgs.values[el.name]) {
                console.log("\nParam \"" + el.name + "\" is not defined or empty.")
                console.log(usage)
                process.exit(1)
            }
        });
    };

    function createOutputFile(folder,fileName) {
        mkdirSync(join(__dirname, "results", folder), { recursive: true });
        const dateIsoString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
        const resultPath = join(__dirname, "results", folder, fileName + '_' + dateIsoString + '.json');
        return resultPath;
    };

    function putFileChunksIntoBuffer(stream) {
        return new Promise((resolve, reject) => {
            let data = [];
            stream.on("data", (chunk) => {
                data.push(chunk);
            });
            stream.on("end", () => resolve(Buffer.concat(data)));
            stream.on("error", reject);
        });
    };

    // --- Functions --->

    // ***************** Script ************************

    _checkingParameters(args, parsedArgs);

    // Create and initialize AWS S3 src and dst client
    // <------------------------------------------------
    console.log("\n ---> Initializing source AWS account...")
    const srcS3Client = new AwsClientsWrapper(srcAccountType,env);
    srcS3Client._initS3();

    console.log("\n ---> Initializing destination AWS account...")
    const dstS3Client = new AwsClientsWrapper(dstAccountType,env);
    dstS3Client._initS3();
    console.log("\n --------------------------------------\n")
    // ------------------------------------------------>

    const fileKeyStream = await open(fileName);

    const errorOutputFile = createOutputFile("failed","copy_mailing_receipts");
    errorOutputFileFileHandler = openSync(errorOutputFile,'a'); // Se il file non esiste verrà creato

    let keepSkip = 1;
    for await (const fileKey of fileKeyStream.readLines()) {

        if (startFileKey !== undefined & fileKey !== startFileKey & keepSkip == 1) {
            continue;
        }
        else {
            keepSkip = 0;
        };

        try {
            const fileStream = await srcS3Client._getObjectCommand(srcBucket, fileKey)

            const file = await putFileChunksIntoBuffer(fileStream.Body);

            // Carica l'oggetto nel bucket destinazione
            await dstS3Client._PutObject(dstBucket, fileKey, file)

            // Stampa a video l'esito dell'operazione
            console.log(JSON.stringify({key: fileKey}));
        }
        catch (error) {
            let err = JSON.stringify({    
                key: fileKey,
                error: {
                    name: error.name,
                    message: error.message,
                }
            });
            appendFileSync(errorOutputFileFileHandler,err + '\n');
            console.log(err);
            switch(error.name){
                case "NoSuchKey":
                    break;
                default:
                    closeSync(errorOutputFileFileHandler);
                    process.exit(1);
            }
        }
    }
    closeSync(errorOutputFileFileHandler);
    // **************************************************
}

main();
