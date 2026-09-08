const { expect } = require("chai");
const sinon = require("sinon");
const {
  parseCsvContent,
  readCsvFile,
  validateRecord,
} = require("../src/csv-reader");

describe("CSV reader", () => {
  describe("header validation", () => {
    it("accepts the exact required header", () => {
      expect(parseCsvContent("iun,recIndex\n").counters.totalRows).to.equal(0);
    });

    [
      ["an empty file", ""],
      ["different names", "iun,index\n"],
      ["reversed columns", "recIndex,iun\n"],
      ["a missing column", "iun\n"],
      ["an additional column", "iun,recIndex,other\n"],
      ["spaces in column names", " iun,recIndex\n"],
    ].forEach(([description, content]) => {
      it(`rejects ${description}`, () => {
        expect(() => parseCsvContent(content)).to.throw(/CSV header/);
      });
    });

    it("accepts an UTF-8 BOM before the exact header", () => {
      const result = parseCsvContent("\ufeffiun,recIndex\nIUN_1,0\n");

      expect(result.records).to.deep.equal([{ iun: "IUN_1", recIndex: 0 }]);
    });
  });

  describe("record validation", () => {
    it("parses quoted values and normalizes outer spaces", () => {
      const result = parseCsvContent('iun,recIndex\n" IUN,EXAMPLE "," 2 "\n');

      expect(result.records).to.deep.equal([
        { iun: "IUN,EXAMPLE", recIndex: 2 },
      ]);
    });

    it("serializes recIndex as a number", () => {
      const result = parseCsvContent("iun,recIndex\nIUN_1,01\n");

      expect(result.records[0].recIndex).to.equal(1);
      expect(result.records[0].recIndex).to.be.a("number");
    });

    it("classifies all required malformed values", () => {
      const result = parseCsvContent([
        "iun,recIndex",
        ",0",
        "IUN_MISSING_INDEX,",
        "IUN_TEXT,text",
        "IUN_DECIMAL,1.5",
        "IUN_NEGATIVE,-1",
        "IUN_MISSING_COLUMN",
        "IUN_EXTRA,0,value",
      ].join("\n"));

      expect(result.records).to.deep.equal([]);
      expect(result.malformedRows).to.deep.equal([
        { line: 2, error: "IUN_REQUIRED" },
        { line: 3, error: "REC_INDEX_REQUIRED" },
        { line: 4, error: "REC_INDEX_NOT_INTEGER" },
        { line: 5, error: "REC_INDEX_NOT_INTEGER" },
        { line: 6, error: "REC_INDEX_NEGATIVE" },
        { line: 7, error: "INVALID_COLUMN_COUNT" },
        { line: 8, error: "INVALID_COLUMN_COUNT" },
      ]);
    });

    it("rejects integers outside the JavaScript safe range", () => {
      expect(validateRecord(["IUN_1", "9007199254740992"])).to.deep.equal({
        valid: false,
        error: "REC_INDEX_NOT_INTEGER",
      });
    });

    it("ignores empty and whitespace-only rows", () => {
      const result = parseCsvContent("iun,recIndex\n\n   \nIUN_1,0\n\t\n");

      expect(result.records).to.deep.equal([{ iun: "IUN_1", recIndex: 0 }]);
      expect(result.counters.totalRows).to.equal(1);
    });
  });

  describe("deduplication and counters", () => {
    it("keeps the first normalized pair and distinct recipients", () => {
      const result = parseCsvContent([
        "iun,recIndex",
        " IUN_1 ,0",
        "IUN_1,0",
        "IUN_1,1",
        "IUN_2,0",
        ",3",
      ].join("\n"));

      expect(result.records).to.deep.equal([
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
        duplicateRows: 1,
        malformedRows: 1,
        publishableRecords: 3,
      });
      expect(result.counters.totalRows).to.equal(
        result.counters.validRows + result.counters.malformedRows
      );
      expect(result.counters.publishableRecords).to.equal(
        result.counters.validRows - result.counters.duplicateRows
      );
    });
  });

  it("reads the whole file before returning parsed records", async () => {
    const readFile = sinon.stub().resolves("iun,recIndex\nIUN_1,0\n");

    const result = await readCsvFile("input.csv", readFile);

    expect(readFile.calledOnceWithExactly("input.csv", "utf8")).to.equal(true);
    expect(result.records).to.deep.equal([{ iun: "IUN_1", recIndex: 0 }]);
  });
});