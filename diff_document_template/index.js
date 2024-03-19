//https://github.com/pagopa/pn-configuration

const { simpleGit, CleanOptions } = require('simple-git');
const fs = require('fs');
const { parseArgs } = require('util');
const path = require('path');

function _writeInFile(path, result) {
    if(fs.existsSync(path)) {
        fs.mkdirSync(path, { recursive: true });
    }
    fs.mkdirSync(path, { recursive: true });
    fs.writeFileSync(path + "/output.txt", result + "", 'utf-8')
}
  
function _checkingParameters(args, values){
    const usage = "Usage: node index.js --tags <tags> [--files]\nnode index.js --tags v2.5.3,v2.5.0"
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
        { name: "tags", mandatory: true, subcommand: [] },
        { name: "files", mandatory: false, subcommand: [] },
    ]
    const values = {
        values: { tags, files },
    } = parseArgs({
        options: {
        tags: {
            type: "string", short: "t", default: undefined
        },
        files: {
            type: "boolean", short: "t", default: false
        },
        },
    });  

    _checkingParameters(args, values)
    const resultPath = path.join(__dirname, 'result');
    const tmpPath = path.join(__dirname, 'tmp');
    const diffPath = "src/main/resources/documents_composition_templates"
    const git = simpleGit().clean(CleanOptions.FORCE);
    tags = tags.split(",");
    if(tags.length != 2) {
        console.log("Param <tags> should be <tag1>,<tag2>")
        process.exit(1)
    }
    if(fs.existsSync(tmpPath)) {
        fs.rmSync(tmpPath, { recursive: true });
    }
    fs.mkdirSync(tmpPath, { recursive: true });
    git.clone("https://github.com/pagopa/pn-delivery-push.git", tmpPath)
    git.cwd(tmpPath)
    tags.push(diffPath)
    console.log(tags)
    git.diff(tags).then(x=> {
        if(x.length != 0) {
            let result = ""
            if(files) {
                x.split("\n").forEach(row => {
                    if (row.startsWith("---") || row.startsWith("+++")) {
                        result = result.concat(row+"\n")
                    }
                });
            }
            else {
                result = x;  
            }
            console.log(result)
            console.log("Diffs are present. Writing in " + resultPath)
            _writeInFile(resultPath, result)
        } else {
            console.log("No diffs in the path " + diffPath)
        }
        fs.rmSync(tmpPath, { recursive: true });
    }).catch(e=> {
        console.log("Error during execution. Probable unavailable tag. " + e)
        fs.rmSync(tmpPath, { recursive: true });
    })
}

main()
