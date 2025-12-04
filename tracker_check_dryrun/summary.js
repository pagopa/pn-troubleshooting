import fs from "fs";
import path from "path";
import { parse } from "csv-parse";

async function generateReportForCsv(filePath) {
  return new Promise((resolve, reject) => {
    const parser = fs
      .createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true }));

    const uniqueRequestIds = new Set();
    const requestIdsWithErrors = new Set();
    const requestIdsWithWarnings = new Set();
    const requestIdsMatchNo = new Set();

    let totalErrors = 0;
    let totalWarnings = 0;
    let totalRows = 0;

    parser.on("data", (row) => {
      totalRows++;

      const requestId = row.requestId;
      const errorType = row.errorType?.trim();
      const errorCategory = row.errorCategory?.trim();
      const match = row.match?.trim();

      // Unique RequestID
      uniqueRequestIds.add(requestId);

      if (match === "NO") {
        requestIdsMatchNo.add(requestId);
      }

      if (errorType === "WARNING") {
        requestIdsWithWarnings.add(requestId);
        totalWarnings++;
      }

      if (errorType === "ERROR") {
        requestIdsWithErrors.add(requestId);
        totalErrors++;
      }

      if (errorCategory && errorCategory !== "") {
        requestIdsWithErrors.add(requestId);
        totalErrors++;
      }
    });

    parser.on("end", () => {
      const totalUnique = uniqueRequestIds.size;

      const percentReqErrors =
        totalUnique === 0 ? 0 :
        ((requestIdsWithErrors.size / totalUnique) * 100).toFixed(2);

      const percentReqWarnings =
        totalUnique === 0 ? 0 :
        ((requestIdsWithWarnings.size / totalUnique) * 100).toFixed(2);

      const percentRowErrors =
        totalRows === 0 ? 0 :
        ((totalErrors / totalRows) * 100).toFixed(2);

      const percentMatchNo =
        totalUnique === 0 ? 0 :
        ((requestIdsMatchNo.size / totalUnique) * 100).toFixed(2);

      resolve({
        totalUniqueRequestIds: totalUnique,
        totalUniqueRequestIdsWithErrors: requestIdsWithErrors.size,
        totalUniqueRequestIdsWithWarnings: requestIdsWithWarnings.size,
        totalErrors,
        totalWarnings,
        totalRows,
        requestIdsMatchNo: requestIdsMatchNo.size,
        percentReqErrors,
        percentReqWarnings,
        percentRowErrors,
        percentMatchNo
      });
    });

    parser.on("error", reject);
  });
}

async function generateReportForAllCsv() {
  const outDir = "./out";
  const files = fs.readdirSync(outDir).filter(f => f.endsWith(".csv"));

  if (files.length === 0) {
    console.log("Nessun CSV trovato in ./out");
    return;
  }

  console.log(`Trovati ${files.length} CSV nella cartella ./out\n`);

  for (const file of files) {
    const filePath = path.join(outDir, file);

    console.log(`Analizzando: ${file} ...`);

    const r = await generateReportForCsv(filePath);

    console.log(`--- Report per ${file} ---`);
    console.log("RequestID unici:", r.totalUniqueRequestIds);
    console.log("RequestID con ERRORI:", r.totalUniqueRequestIdsWithErrors, `(${r.percentReqErrors}%)`);
    console.log("RequestID con WARNING:", r.totalUniqueRequestIdsWithWarnings, `(${r.percentReqWarnings}%)`);
    console.log("Numero totale errori:", r.totalErrors, `(${r.percentRowErrors}% delle righe)`);
    console.log("Numero totale warning:", r.totalWarnings);
    console.log("RequestID NO MATCH timeline:", r.requestIdsMatchNo, `(${r.percentMatchNo}%)`);
    console.log("Totale righe CSV:", r.totalRows);
    console.log("");
  }
}

generateReportForAllCsv();
