const { _parseCSV } = require("pn-common/libs/utils");

const EXPECTED_HEADER = Object.freeze(["iun", "recIndex"]);

function parseCsvRows(parsedRows) {
  if (parsedRows.length === 0) {
    throw new Error("CSV header is missing");
  }

  assertExpectedHeader(Object.keys(parsedRows[0]));

  const records = [];
  const malformedRows = [];
  let validRows = 0;

  parsedRows.forEach((row, index) => {
    const validation = validateRecord(EXPECTED_HEADER.map((header) => row[header]));
    if (!validation.valid) {
      malformedRows.push({ line: index + 2, error: validation.error });
      return;
    }

    validRows += 1;
    records.push(validation.record);
  });

  const malformedRowsCount = malformedRows.length;
  return {
    records,
    malformedRows,
    counters: {
      totalRows: parsedRows.length,
      validRows,
      malformedRows: malformedRowsCount,
      publishableRecords: records.length,
    },
  };
}

async function readCsvFile(filePath, parseCsv = _parseCSV) {
  const parsedRows = await parseCsv(filePath, ",");
  return parseCsvRows(parsedRows);
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
  const iun = rawIun?.trim();
  const recIndexValue = rawRecIndex?.trim();

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
  parseCsvRows,
  readCsvFile,
  validateRecord,
};