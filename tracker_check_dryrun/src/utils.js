import fs from "fs";
import { parse } from "csv-parse";
import { stringify } from "csv-stringify/sync";

export async function readCSVFile(filePath) {
  return  fs
    .createReadStream(filePath)
    .pipe(parse({ columns: true, trim: true }));
}

export async function readAllCSVFile(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];

    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true }))
      .on("data", (row) => results.push(row))
      .on("end", () => resolve(results))
      .on("error", (err) => reject(err));
  });
}

export function writeCSVFile(filePath, header, rows) {
  const csv = stringify(rows, {
    header: true,
    columns: header,
    quoted: true,
  });

  fs.writeFileSync(filePath, csv, "utf-8");
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