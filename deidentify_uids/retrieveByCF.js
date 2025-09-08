const { parseArgs } = require("util");
const path = require("path");
const fs = require("fs"); // non "fs/promises"

function birthDateFromCF(cf) {
  const year = parseInt(cf.substring(6, 8), 10);
  const monthChar = cf.charAt(8);
  let day = parseInt(cf.substring(9, 11), 10);

  const monthMap = {
    A: 1, B: 2, C: 3, D: 4, E: 5,
    H: 6, L: 7, M: 8, P: 9, R: 10,
    S: 11, T: 12,
  };
  const month = monthMap[monthChar.toUpperCase()];
  if (!month) throw new Error("Mese non valido");

  if (day > 31) {
    day -= 40; // femmina
  }

  const currentYear = new Date().getFullYear() % 100;
  const century = year <= currentYear ? 2000 : 1900;
  const fullYear = century + year;

  return new Date(fullYear, month - 1, day);
}

function prepareWriteStream(inputFile) {
  const outputFile = path.join(
    path.dirname(inputFile),
    path.basename(inputFile, path.extname(inputFile)) + "_out.csv"
  );

  const newFile = !fs.existsSync(outputFile);
  const writeStream = fs.createWriteStream(outputFile, { flags: "a" });

  if (newFile) {
    writeStream.write("uuid,birthDate\n");
  }
  return writeStream;
}

async function main() {
  const { values } = parseArgs({
    options: {
      fileName: { type: "string", short: "t" },
    },
  });

  if (!values.fileName) {
    console.error("Usage: node index.js --fileName <file_path>");
    process.exit(1);
  }

  const fileName = values.fileName;
  const fileRows = fs
    .readFileSync(fileName, "utf8")
    .split("\n")
    .filter((x) => x.trim() !== "");

  const writeStream = prepareWriteStream(fileName);

  console.log("Reading from file...");

  for (const row of fileRows) {
    const [uuid, cf] = row.split(",");
    try {
      const birthDate = birthDateFromCF(cf);
      const birthDateStr = birthDate.toISOString().split("T")[0];
      await writeStream.write(`${uuid},${birthDateStr}\n`);
    } catch (err) {
      console.error(`Errore CF ${cf}: ${err.message}`);
    }
  }

  writeStream.end(() => {
    console.log("Scrittura completata");
  });
}

main();
