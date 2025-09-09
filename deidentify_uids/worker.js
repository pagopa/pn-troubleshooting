const fs = require("fs");
const readline = require("readline");
const { ApiClient } = require("./libs/api");
const path = require("path");
require("dotenv").config();

const urls = {
  PF: {
    url: "https://api.tokenizer.pdv.pagopa.it",
    apikey: process.env.API_PDV,
  },
  PG: {
    url: "https://api.selfcare.pagopa.it",
    apikey: process.env.API_SELFCARE,
  },
};

const start = Date.now();

function formatMemoryUsage(memoryUsage) {
  return Object.fromEntries(
    Object.entries(memoryUsage).map(([key, value]) => [
      key,
      `${(value / 1024 / 1024).toFixed(2)} MB`,
    ])
  );
}

function printMemory() {
  const mem = formatMemoryUsage(process.memoryUsage());
  console.log(`💾 [PID ${process.pid}] Memory usage: ${JSON.stringify(mem)}`);
}

process.on("message", async ({ file }) => {
  console.log(`👷 [PID ${process.pid}] Inizio elaborazione file: ${file}`);
  printMemory();

  const outputFile = path.join(
    path.dirname(file),
    path.basename(`${file.split(".")[0]}_out`) + ".csv"
  );
  const writeStream = fs.createWriteStream(outputFile, { flags: "a" });

  let lock;
  let lastUuid = null;
  if (!fs.existsSync(outputFile)) {
    writeStream.write(`uuid,taxid\n`);
  } else {
    lock = true;
    const fileStream = fs.createReadStream(outputFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim()) {
        lastUuid = line.split(",")[0];
      }
    }

    console.log("Ultima riga trovata:", lastUuid);
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });

  for await (const uuid of rl) {
    if (lock) {
      if (uuid === lastUuid) {
        lock = false;
      }
    } else if (uuid) {
      const receiverType = uuid.substring(0, 2);
      if (receiverType == "PF") {
        res = await ApiClient.decodeUID(
          uuid,
          urls[receiverType].url,
          urls[receiverType].apikey
        );
        writeStream.write(`${uuid},${res.pii}\n`);
      } else {
        res = await ApiClient.decodeUID(
          uuid,
          urls[receiverType].url,
          urls[receiverType].apikey
        );
        writeStream.write(`${uuid},${res.taxCode}\n`);
      }
      console.log(`[PID ${process.pid}] ${file}: ${uuid}`);
    }
  }

  printMemory();
  const end = Date.now();
  console.log(`Tempo di esecuzione: ${(end - start) / 1000} secondi`);
  console.log(`✅ [PID ${process.pid}] Finito file: ${file}`);
  process.exit(0);
});
