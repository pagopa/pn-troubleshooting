const fs = require("fs/promises");
const { parse } = require("csv-parse/sync");

const EXPECTED_HEADER = Object.freeze(["iun", "recIndex"]);

function parseCsvContent(content) {
  const parsedRows = parse(content, {
    bom: true,
    info: true,
    relax_column_count: true,
    skip_empty_lines: true,
  });

  if (parsedRows.length === 0) {
    throw new Error("CSV header is missing");
  }

  const [headerRow, ...parsedDataRows] = parsedRows;
  assertExpectedHeader(headerRow.record);
  const dataRows = parsedDataRows.filter(({ record }) => (
    !record.every((value) => value.trim() === "")
  ));

  const records = [];
  const malformedRows = [];
  const seenRecords = new Set();
  let validRows = 0;
  let duplicateRows = 0;

  for (const { record, info } of dataRows) {
    const validation = validateRecord(record);
    if (!validation.valid) {
      malformedRows.push({ line: info.lines, error: validation.error });
      continue;
    }

    validRows += 1;
    const normalizedRecord = validation.record;
    const deduplicationKey = JSON.stringify([
      normalizedRecord.iun,
      normalizedRecord.recIndex,
    ]);

    if (seenRecords.has(deduplicationKey)) {
      duplicateRows += 1;
      continue;
    }

    seenRecords.add(deduplicationKey);
    records.push(normalizedRecord);
  }

  const malformedRowsCount = malformedRows.length;
  return {
    records,
    malformedRows,
    counters: {
      totalRows: dataRows.length,
      validRows,
      duplicateRows,
      malformedRows: malformedRowsCount,
      publishableRecords: records.length,
    },
  };
}

async function readCsvFile(filePath, readFile = fs.readFile) {
  const content = await readFile(filePath, "utf8");
  return parseCsvContent(content);
}

function assertExpectedHeader(header) {
  const matches = header.length === EXPECTED_HEADER.length
    && header.every((value, index) => value === EXPECTED_HEADER[index]);

  if (!matches) {
    throw new Error(`CSV header must be exactly: ${EXPECTED_HEADER.join(",")}`);
  }
}

function validateRecord(record) {
  if (record.length !== EXPECTED_HEADER.length) {
    return invalid("INVALID_COLUMN_COUNT");
  }

  const [rawIun, rawRecIndex] = record;
  const iun = rawIun.trim();
  const recIndexValue = rawRecIndex.trim();

  if (!iun) {
    return invalid("IUN_REQUIRED");
  }
  if (!recIndexValue) {
    return invalid("REC_INDEX_REQUIRED");
  }
  if (!/^[+-]?\d+$/.test(recIndexValue)) {
    return invalid("REC_INDEX_NOT_INTEGER");
  }

  const recIndex = Number(recIndexValue);
  if (!Number.isSafeInteger(recIndex)) {
    return invalid("REC_INDEX_NOT_INTEGER");
  }
  if (recIndex < 0) {
    return invalid("REC_INDEX_NEGATIVE");
  }

  return { valid: true, record: { iun, recIndex } };
}

function invalid(error) {
  return { valid: false, error };
}

module.exports = {
  EXPECTED_HEADER,
  parseCsvContent,
  readCsvFile,
  validateRecord,
};