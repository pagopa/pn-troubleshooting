const { parseArgs } = require("util");
const path = require("path");
const fs = require("fs/promises");
const { fork } = require("child_process");

function _checkingParameters(args, values) {
  const usage = "Usage: node index.js --dirPath <dir_path>";
  //CHECKING PARAMETER
  args.forEach((el) => {
    if (el.mandatory && !values.values[el.name]) {
      console.log("Param " + el.name + " is not defined");
      console.log(usage);
      process.exit(1);
    }
  });
  args
    .filter((el) => {
      return el.subcommand.length > 0;
    })
    .forEach((el) => {
      if (values.values[el.name]) {
        el.subcommand.forEach((val) => {
          if (!values.values[val]) {
            console.log("SubParam " + val + " is not defined");
            console.log(usage);
            process.exit(1);
          }
        });
      }
    });
}

async function spawnWorkersFromDir(dirPath) {
  console.log("📂 Directory:", dirPath);

  try {
    // Elenco file nella directory
    const files = (await fs.readdir(dirPath)).filter(x => !x.includes("out"));

    for (const file of files) {
      const fullPath = path.join(dirPath, file);

      // Avvia un worker per ogni file
      const worker = fork("./worker.js");
      worker.send({ file: fullPath });

      worker.on("exit", (code) => {
        console.log(`🔹 Worker per ${file} terminato con codice ${code}`);
      });
    }
  } catch (err) {
    console.error("Errore:", err);
  }
}

async function main() {
  const args = [{ name: "dirPath", mandatory: true, subcommand: [] }];

  const { values } = parseArgs({
    options: {
      dirPath: {
        type: "string",
        short: "t",
        default: undefined,
      },
    },
  });

  _checkingParameters(args, { values });

  const dirPath = values.dirPath;

  console.log("Preparing data...");

  console.log("Reading from file...");
  await spawnWorkersFromDir(dirPath);
}

main().then(function () {
  console.log("END");
});
