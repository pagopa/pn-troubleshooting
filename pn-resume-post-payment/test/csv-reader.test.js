const { expect } = require("chai");
const sinon = require("sinon");
const {
  parseCsvRows,
  readCsvFile,
  validateRecord,
} = require("../src/csv-reader");

describe("CSV reader", () => {
  describe("header validation", () => {
    it("accepts the exact required header", () => {
      const result = parseCsvRows([{ iun: "IUN_1", recIndex: "0" }]);

      expect(result.counters.totalRows).to.equal(1);
    });

    [
      ["different names", { iun: "IUN_1", index: "0" }],
      ["reversed columns", { recIndex: "0", iun: "IUN_1" }],
      ["a missing column", { iun: "IUN_1" }],
      ["an additional column", { iun: "IUN_1", recIndex: "0", other: "value" }],
      ["spaces in column names", { " iun": "IUN_1", recIndex: "0" }],
    ].forEach(([description, row]) => {
      it(`rejects ${description}`, () => {
        expect(() => parseCsvRows([row])).to.throw(/CSV header/);
      });
    });

    it("rejects files without data rows because pn-common exposes no header", () => {
      expect(() => parseCsvRows([])).to.throw("CSV header is missing");
    });
  });

  describe("record validation", () => {
    it("normalizes outer spaces from parsed values", () => {
      const result = parseCsvRows([{ iun: " IUN,EXAMPLE ", recIndex: " 2 " }]);

      expect(result.records).to.deep.equal([
        { iun: "IUN,EXAMPLE", recIndex: 2 },
      ]);
    });

    it("serializes recIndex as a number", () => {
      const result = parseCsvRows([{ iun: "IUN_1", recIndex: "01" }]);

      expect(result.records[0].recIndex).to.equal(1);
      expect(result.records[0].recIndex).to.be.a("number");
    });

    it("classifies all required malformed values", () => {
      const result = parseCsvRows([
        { iun: "", recIndex: "0" },
        { iun: "IUN_MISSING_INDEX", recIndex: "" },
        { iun: "IUN_TEXT", recIndex: "text" },
        { iun: "IUN_DECIMAL", recIndex: "1.5" },
        { iun: "IUN_NEGATIVE", recIndex: "-1" },
      ]);

      expect(result.records).to.deep.equal([]);
      expect(result.malformedRows).to.deep.equal([
        { line: 2, error: "IUN_REQUIRED" },
        { line: 3, error: "REC_INDEX_REQUIRED" },
        { line: 4, error: "REC_INDEX_NOT_INTEGER" },
        { line: 5, error: "REC_INDEX_NOT_INTEGER" },
        { line: 6, error: "REC_INDEX_NEGATIVE" },
      ]);
    });

    it("rejects integers outside the JavaScript safe range", () => {
      expect(validateRecord(["IUN_1", "9007199254740992"])).to.deep.equal({
        valid: false,
        error: "REC_INDEX_NOT_INTEGER",
      });
    });

    it("rejects records with missing parsed columns", () => {
      expect(validateRecord(["IUN_1"])).to.deep.equal({
        valid: false,
        error: "INVALID_COLUMN_COUNT",
      });
    });
  });

  describe("counters", () => {
    it("keeps all valid records, including duplicate pairs", () => {
      const result = parseCsvRows([
        { iun: " IUN_1 ", recIndex: "0" },
        { iun: "IUN_1", recIndex: "0" },
        { iun: "IUN_1", recIndex: "1" },
        { iun: "IUN_2", recIndex: "0" },
        { iun: "", recIndex: "3" },
      ]);

      expect(result.records).to.deep.equal([
        { iun: "IUN_1", recIndex: 0 },
        { iun: "IUN_1", recIndex: 0 },
        { iun: "IUN_1", recIndex: 1 },
        { iun: "IUN_2", recIndex: 0 },
      ]);
      expect(result.malformedRows).to.deep.equal([
        { line: 6, error: "IUN_REQUIRED" },
      ]);
      expect(result.counters).to.deep.equal({
        totalRows: 5,
        validRows: 4,
        malformedRows: 1,
        publishableRecords: 4,
      });
      expect(result.counters.totalRows).to.equal(
        result.counters.validRows + result.counters.malformedRows
      );
      expect(result.counters.publishableRecords).to.equal(
        result.counters.validRows
      );
    });
  });

  it("delegates file parsing to pn-common", async () => {
    const parseCsv = sinon.stub().resolves([{ iun: "IUN_1", recIndex: "0" }]);

    const result = await readCsvFile("input.csv", parseCsv);

    expect(parseCsv.calledOnceWithExactly("input.csv", ",")).to.equal(true);
    expect(result.records).to.deep.equal([{ iun: "IUN_1", recIndex: 0 }]);
  });

  it("propagates pn-common parser errors", async () => {
    const parseCsv = sinon.stub().rejects(new Error("Invalid Record Length"));

    let error;
    try {
      await readCsvFile("input.csv", parseCsv);
    } catch (caught) {
      error = caught;
    }

    expect(error.message).to.equal("Invalid Record Length");
  });
});