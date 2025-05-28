const { AwsClientsWrapper } = require('pn-common')
const { parseArgs } = require('node:util')
const { open } = require('node:fs/promises')
//const { openSync, closeSync, mkdirSync, appendFileSync } = require('node:fs')
//const { join } = require('node:path')

const args = [
    { name: "paramStoreName", mandatory: true },
    { name: "inputFile", mandatory: true },
    { name: "env", mandatory: true },
    { name: "dryRun", mandatory: false },
    { name: "overwrite", mandatory: false },
    { name: "region", mandatory: false }
]

const parsedArgs = { values: { region, env, inputFile, dryRun, overwrite, paramStoreName } } = parseArgs(
    {
        options: {
            region: { type: "string", short: "r", default: "eu-south-1" },
            env: { type: "string", short: "e" },
            inputFile: { type: "string", short: "f" },
            dryRun: { type: "string", short: "d" },
            overwrite: { type: "string", short: "o", default: "false" },
            paramStoreName: { type: "string", short: "o" }
        }
    })

// -----------------------------------------------------

function _checkingParameters(args, parsedArgs) {

    const usage = `
    Usage: 
    
    node ./index.js  \\
        --env=<env> \\
        --paramStoreName=<paramStoreName> \\ 
        --inputFile=<output dump_dynamodb 'pn-AuthJwtIssuers'> \\
        --dryRun=<true|false> \\
        --overwrite=<true|false>
      
      `

    // Verifica se un argomento è stato inserito oppure inserito con valore vuoto
    args.forEach(el => {
        if (el.mandatory && !parsedArgs.values[el.name]) {
            console.log("\nParam \"" + el.name + "\" is not defined or empty.")
            console.log(usage)
            process.exit(1)
        }
    });
}

async function main() {

     _checkingParameters(args, parsedArgs)

    const finalArray = []

    const inputFileHandler = await open(inputFile, 'r')

    for await (const line of inputFileHandler.readLines()) {

        const parsedLine = JSON.parse(line) // ogni linea è un JSON inline
        const pk = parsedLine.hashKey
        const sk = parsedLine.sortKey
        if (!pk.match(/DISABLED$/)?.[0] & sk === "CFG") {
            const domain = parsedLine.JWKSUrl.replace(/^https:\/\//,'').replace(/\/.*$/,'')
            const iss = pk.replace(/ISS~/,'')
            if (domain) {
                const arrayElem = {
                    iss: iss,
                    domain: domain
                }
                finalArray.push(arrayElem)
            }
        }
    }
    const finalArrayJson = JSON.stringify(finalArray, null, 2)
    inputFileHandler?.close()

    console.log(finalArrayJson)

    if (dryRun === "false") {
        const operation = overwrite === "true" ? "Updating" : "Creating"
        console.log(`\n --> 'dryRun' mode disabled. ${operation} parameter '${paramStoreName}'...`)

        const ssmClient = new AwsClientsWrapper("core", env)
        ssmClient._initSSM()
        try {
            await ssmClient._putParameter(paramStoreName, finalArrayJson, "String", overwrite)
        }
        catch (e) {
            switch (e.name) {
                case "ParameterAlreadyExists":
                    console.log('\n --> Error: input Parameter already exists. Exit.\n')
                    process.exit(3)
                    break
                default:
                    console.log(e)
                    process.exit(1)
            }
        }
        console.log('\n --> Done.\n')
    }
}

main()
