const jsonDiff = require('json-diff')
const fs = require('fs')

function compare(configFolder, envA, envB){
    const configAFolder = `${configFolder}/${envA}`
    const configBFolder = `${configFolder}/${envB}`

    const configAFolders = fs.readdirSync(configAFolder)

    for (const key in configAFolders) {
        if (configAFolders.hasOwnProperty(key)) {
            const configA = configAFolder+'/'+configAFolders[key]+'/scripts/aws/cfn/microservice-'+envA+'-cfg.json';
            const configB = configBFolder+'/'+configAFolders[key]+'/scripts/aws/cfn/microservice-'+envB+'-cfg.json';

            console.log('=====================')
            console.log('compare configA '+configA+' with configB '+configB)

            if(!fs.existsSync(configA)){
                console.log('configA '+configA+' doesn\'t exist')
                continue
            }

            if(!fs.existsSync(configB)){
                console.log('configB '+configB+' doesn\'t exist')
                continue
            }

            console.log(jsonDiff.diffString(JSON.parse(fs.readFileSync(configA)), JSON.parse(fs.readFileSync(configB))));
            console.log('=====================')
        }
    }
}

const envA = process.argv[2]
const envB = process.argv[3]
const configurationPath = process.argv[4]

compare(configurationPath, envA, envB)