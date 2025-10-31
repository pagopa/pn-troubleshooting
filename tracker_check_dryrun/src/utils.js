import fs from "fs";
import { parse } from "csv-parse";
import { stringify } from "csv-stringify/sync";

export async function readCSVFile(filePath) {
  const records = [];
  const parser = fs
    .createReadStream(filePath)
    .pipe(parse({ columns: true, trim: true }));

  for await (const record of parser) {
    // record = { IUN: '...', attemptId: '...', nPcRetry: '...' }
    if (!record.IUN || !record.attemptId) {
      console.warn(`⚠️ Riga incompleta:`, record);
      continue;
    }
    let numPcRetry = parseInt(record.nPcRetry);
    if (isNaN(numPcRetry)) {
      numPcRetry = null;
    }

    records.push({
      iun: record.IUN,
      attemptId: record.attemptId,
      numPcRetry,
    });
  }

  return records;
}

export function appendCSVRow(filePath, header, rowData) {
  const fileExists = fs.existsSync(filePath);

  // Se il file non esiste, scriviamo anche l'header
  const csv = stringify([rowData], {
    header: !fileExists,
    columns: header,
  });

  fs.appendFileSync(filePath, csv, "utf-8");
}

export function showProgress(current, total, prefix = '') {
  const barLength = 40;
  const percentage = Math.min(100, Math.floor((current / total) * 100));
  const filledLength = Math.floor((barLength * current) / total);
  const emptyLength = barLength - filledLength;
  
  const bar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);
  const line = `\r${prefix}[${bar}] ${percentage}% (${current}/${total})`;
  
  process.stdout.write(line);
  
  if (current >= total) {
    process.stdout.write('\n');
  }
}

export function writeFileSync(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}