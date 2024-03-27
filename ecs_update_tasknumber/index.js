const { AwsClientsWrapper } = require("./lib/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { simpleGit, CleanOptions } = require('simple-git');
const path = require('path');

async function updateService(wrapper, msName, clusterName, desiredCount, service) {
    await wrapper._updateService(clusterName, desiredCount, service, msName)
    console.log(msName + " mock modified desired count to " + desiredCount)
}

async function updateAutoscaling(wrapper, msName, resourceId, min, max) {
    await wrapper._registerScalableTarget(resourceId, min, max)
    console.log(msName + " modified minTask to " + min + " and maxTask to " + max)
}


function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> [--loadtest]"
  //CHECKING PARAMETER
  args.forEach(el => {
    if(el.mandatory && !values.values[el.name]){
      console.log("Param " + el.name + " is not defined")
      console.log(usage)
      process.exit(1)
    }
  })
  args.filter(el=> {
    return el.subcommand.length > 0
  }).forEach(el => {
    if(values.values[el.name]) {
      el.subcommand.forEach(val => {
        if (!values.values[val]) {
          console.log("SubParam " + val + " is not defined")
          console.log(usage)
          process.exit(1)
        }
      })
    }
  })
}

async function main() {
    const args = [
        { name: "envName", mandatory: true, subcommand: [] },
        { name: "loadtest", mandatory: false, subcommand: [] }
    ]
    const values = {
        values: { envName, loadtest },
    } = parseArgs({
        options: {
        envName: {
            type: "string", short: "e", default: undefined
        },
        loadtest: {
            type: "boolean", short: "t", default: false
        }
        },
    });  

    _checkingParameters(args, values)
    const tmpPath = path.join(__dirname, 'tmp');
    let params;
    if(!loadtest) {
        if(envName=="dev") {
            params = JSON.parse(fs.readFileSync("./conf/ecs_normal_conf.json", { encoding: 'utf8', flag: 'r' }))
        }
        else {
            const git = simpleGit().clean(CleanOptions.FORCE);
            if(fs.existsSync(tmpPath)) {
                fs.rmSync(tmpPath, { recursive: true });
            }
            fs.mkdirSync(tmpPath, { recursive: true });
            await git.clone("https://github.com/pagopa/pn-configuration.git", tmpPath)
        }
    }
    else {
        params = JSON.parse(fs.readFileSync("./conf/ecs_load_conf.json", { encoding: 'utf8', flag: 'r' }))
    }
    const coreProfile = 'sso_pn-core-' + envName
    const confinfoProfile = 'sso_pn-confinfo-' + envName
    const accounts = [
        new AwsClientsWrapper( coreProfile ),
        new AwsClientsWrapper( confinfoProfile )
    ]
    for (z = 0; z < accounts.length; z++) {
        const wrapper = accounts[z]
        const clusters = await wrapper._listClusters();
        for (i = 0; i < clusters.clusterArns.length; i++){
            const clusterName = clusters.clusterArns[i].split("/")[1]
            const services = await wrapper._listServices(clusterName)
            for (j = 0; j < services.serviceArns.length; j++){
                const resourceId = services.serviceArns[j].split(":")[services.serviceArns[j].split(":").length - 1]
                let microserviceName;
                if(resourceId.indexOf("-microsvc-") >= 0) {
                    microserviceName = resourceId.split(clusterName + "/")[1].split("-microsvc-")[0]
                }
                else if ( resourceId.indexOf("mockconsolidatore") >= 0) {
                    microserviceName = "pn-external-channels"
                }
                else if ( resourceId.indexOf("spidhub") < 0) {
                    microserviceName = resourceId.split(clusterName + "/")[1].split("-")[0]
                }
                else {
                    console.log("SKIPPED SPIDHUB CASE")
                    continue;
                }
                if(loadtest || envName == "dev") {
                    if(params[microserviceName] != undefined) {
                        if(params[microserviceName].type == "mock") {
                            await updateService(wrapper, microserviceName, clusterName, params[microserviceName].desiredCount, services.serviceArns[j])
                        }
                        else if(params[microserviceName].type == "svc") {
                            await updateAutoscaling(wrapper, microserviceName, resourceId, params[microserviceName].MinTasksNumber, params[microserviceName].MaxTasksNumber)
                        }        
                    }
                    else {
                        console.log("SKIPPED " + microserviceName)
                    }
                }
                else {
                    if (envName != "dev") {
                        let path = tmpPath + "/" + envName + "/" + microserviceName + "/scripts/aws/cfn/microservice-" + envName+ "-cfg.json";
                        if(fs.existsSync(path)){
                            const params = JSON.parse(fs.readFileSync(path, { encoding: 'utf8', flag: 'r' })).Parameters
                            if(params?.MinTasksNumber && params?.MaxTasksNumber) {
                                await updateAutoscaling(wrapper, microserviceName, resourceId, parseInt(params.MinTasksNumber), parseInt(params.MaxTasksNumber)) 
                            }
                            else {
                                await updateService(wrapper, microserviceName, clusterName, 1, services.serviceArns[j])
                            }
                        }
                        else {
                            await updateService(wrapper, microserviceName, clusterName, 1, services.serviceArns[j])
                        }
                    }
                }
            }
        }
    }
    if(fs.existsSync(tmpPath)) {
        fs.rmSync(tmpPath, { recursive: true });
    }
    console.log("FINISHED")
}

main()