const fs = require("fs");
const { XMLParser } = require("fast-xml-parser");

class TestCasesInfos {

  constructor() {
    this._testCases = {};
  }

  _addCall( callData /* { testCaseId, method, url, traceId, approximateEpochMs } */) {

    let testCase = this._testCases[ callData.testCaseId ];
    if( ! testCase ) {
      testCase = { testCaseId: callData.testCaseId, requests: [] }
      this._testCases[ callData.testCaseId ] = testCase
    }
    testCase.requests.push({ ... callData })
  }

  listTestCasesIds() {
    return Object.keys( this._testCases );
  }

  listCalls( testCaseId ) {
    let testCase = this._testCases[ testCaseId ];
    return testCase?.requests || []
  }

}

const HTTP_CALL_LINE_STRING = "Request TraceId, method, url, scenario: \[Root=";
const HTTP_CALL_LINE_REGEXP = /.*Request TraceId, method, url, scenario: \[Root=/;
const HTTP_CALL_LINE_GET_SQUARE_BRACKET = /[^\[]*\[([^\]]+)\].*/;

class XmlReportParser {

  constructor() {
    this._xmlParser = new XMLParser({ ignoreAttributes: false });
  }

  parse( filePathAndName ) {
    const xmlBuffer = fs.readFileSync( filePathAndName );
    const xmlObj = this._xmlParser.parse( xmlBuffer );

    const testCases = new TestCasesInfos();

    for( let testCaseXmlObj of xmlObj.testsuite.testcase ) {
      if (testCaseXmlObj['system-out']){
        const allLines = testCaseXmlObj['system-out'].split("\n")
           for( let line of allLines ) {
             if( line.includes( HTTP_CALL_LINE_STRING ) ) {
               this._parseOneLine( testCases, line );
            }
        }
      }
    }

    return testCases;
  }

  _parseOneLine( testCases, line ) {
    
    const dateHour = line.replace(/([^ ]+ [0-9][0-9]).*/, "$1");
    const date = Date.parse(dateHour.replace(/ .*/, ""));
    const hour = parseInt(dateHour.replace(/[^ ]+ /, ""), 10);
    
    const approximateStartEpochMs = date + (hour - 3) * 3600 * 1000;
    const approximateEndEpochMs = date + (hour - 1) * 3600 * 1000;
    const approximateEpochMs = { start: approximateStartEpochMs, end: approximateEndEpochMs };

    const infoArr = line
              .replace( HTTP_CALL_LINE_REGEXP, "[")
              .replace( HTTP_CALL_LINE_GET_SQUARE_BRACKET, "$1")
              .split(",");
          
    const traceId = (infoArr[0] || "").trim();
    const method = (infoArr[1] || "").trim();
    const url = (infoArr[2] || "").trim();
    const testCaseId = (infoArr[3] || "").replace(/\[/, "").trim();

    testCases._addCall({ testCaseId, method, url, traceId, approximateEpochMs });
  }

}


exports.TestCasesInfos = TestCasesInfos;
exports.XmlReportParser = XmlReportParser;
