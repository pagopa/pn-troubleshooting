const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const { parseArgs } = require('util');
const { exec } = require('child_process');
const fs = require('fs');
const fsPromises = fs.promises;
const util = require('util');
const execPromise = util.promisify(exec);

function _checkingParameters(args, values){
    const usage = "Usage: index.js --envName <env-name>"
    //CHECKING PARAMETER
    args.forEach(el => {
      if(el.mandatory && !values.values[el.name]){
        console.log("Param " + el.name + " is not defined")
        console.log(usage)
        process.exit(1)
      }
    })
  }

  
const args = [
    { name: "envName", mandatory: true, subcommand: [] }
  ]
  
let coreSSMClient;

async function getCertificateExpiry(ssmClient, cert) {
    const filePath = './' + cert.cert_name.split("/")[cert.cert_name.split("/").length-1] + '.crt';
    try {
        const input = {
            Name: cert.cert_name,
            WithDecryption: true
        };
        const command = new GetParameterCommand(input);
        const res = await ssmClient.send(command);
        
        if (!res.Parameter || !res.Parameter.Value) {
            throw new Error(`SSM Parameter value is empty for ${cert.cert_name}`);
        }

        const decodedData = Buffer.from(JSON.parse(res.Parameter.Value).cert, 'base64').toString('utf-8');
        
        // Clean up pre-existing file if any
        try {
            await fsPromises.access(filePath);
            await fsPromises.unlink(filePath);
        } catch (e) {
            // File does not exist, ignore
        }

        await fsPromises.writeFile(filePath, decodedData, { flag: 'wx' });

        const { stdout } = await execPromise(`openssl x509 -noout -enddate -in "${filePath}"`);
        const dateStr = stdout.split("=")[stdout.split("=").length - 1].trim();
        const expiryDate = new Date(dateStr);
        if (isNaN(expiryDate.getTime())) {
            throw new Error(`Invalid date parsed: ${dateStr}`);
        }
        return { cert_name: cert.cert_name, expiryDate, dateStr };
    } finally {
        try {
            await fsPromises.unlink(filePath);
        } catch (unlinkErr) {
            // Ignore error if file doesn't exist
        }
    }
}

function compareAndPrint(results) {
    const certDates = {};
    for (const res of results) {
        if (res && res.cert_name && res.expiryDate) {
            certDates[res.cert_name] = res.expiryDate;
        }
    }

    const nextCerts = results.filter(r => r && r.cert_name.endsWith('-next'));

    for (const nextCert of nextCerts) {
        const nextName = nextCert.cert_name;
        const baseName = nextName.slice(0, -5); // remove '-next'
        
        const nextDate = certDates[nextName];
        const baseDate = certDates[baseName];

        if (nextDate && baseDate) {
            if (nextDate > baseDate) {
                const diffMs = nextDate - baseDate;
                const diffDays = diffMs / (1000 * 60 * 60 * 24);
                const diffMonths = diffDays / 30;
                console.log(`[SUCCESS] Certificate "${nextName}" is later than base "${baseName}" by ${diffDays.toFixed(1)} days (${diffMonths.toFixed(1)} months).`);
            } else {
                const diffMs = baseDate - nextDate;
                const diffDays = diffMs / (1000 * 60 * 60 * 24);
                console.warn(`[WARNING] Certificate "${nextName}" is NOT later than base "${baseName}". Base is ahead by ${diffDays.toFixed(1)} days.`);
            }
        } else {
            if (!baseDate && nextDate) {
                console.log(`[INFO] Could not compare "${nextName}" because base certificate "${baseName}" was not fetched.`);
            }
        }
    }
}

async function run() {
    if (!coreSSMClient) {
        const values = parseArgs({
            options: {
                envName: {
                type: "string", short: "e", default: undefined
                }
            },
        });  
        _checkingParameters(args, values);
        const envName = values.values.envName;
        const awsCoreProfile = "sso_pn-core-" + envName;
        const awsConfinfoProfile = "sso_pn-confinfo-" + envName;
        const coreCredentials = fromSSO({ profile: awsCoreProfile })();
        coreSSMClient = new SSMClient({
            credentials: coreCredentials,
            region: 'eu-south-1'
        });
    }

    try {
        const jsonString = await fsPromises.readFile("./certificate.json", "utf8");
        const parameters = JSON.parse(jsonString);
        
        const results = await Promise.all(parameters.map(async (cert) => {
            try {
                const res = await getCertificateExpiry(coreSSMClient, cert);
                console.log(`Il Certificato ${res.cert_name}.crt scade in data: ${res.dateStr}`);
                return res;
            } catch (err) {
                console.error(`Errore nel recupero/parsing del certificato ${cert.cert_name}:`, err.message || err);
                return null;
            }
        }));

        console.log("\n--- Certificate Verification Results ---");
        compareAndPrint(results);
    } catch (err) {
        console.error("Error running validation:", err);
    }
}

module.exports = {
    getCertificateExpiry,
    compareAndPrint,
    run
};

if (require.main === module) {
    run();
}