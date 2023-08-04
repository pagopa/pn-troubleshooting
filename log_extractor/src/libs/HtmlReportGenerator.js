const fs = require("fs");
const CucumberBaseReporter = require('cucumber-html-reporter');

class HtmlReportGenerator {

  constructor() {}

  async generateReport( jsonInputPath, htmlOutputPath, env, testCasesIdsList ) {
    await this._generateBaseReport( jsonInputPath, htmlOutputPath, env );
    await this._enhanceHtmlReport( htmlOutputPath, testCasesIdsList );
  }


  async _generateBaseReport( jsonInputPath, htmlOutputPath, env ) {
    const options = {
          theme: 'bootstrap',
          jsonFile: jsonInputPath,
          output: htmlOutputPath,
          reportSuiteAsScenarios: true,
          scenarioTimestamp: true,
          launchReport: false,
          metadata: {
              "PN":"not_defined",
              "Test Environment": env,
              "Browser": "None",
              "Platform": "SomeUnix",
              "Parallel": "Scenarios",
              "Executed": "Remote"
          },
          failedSummaryReport: false,
        };
    
    const promise = new Promise( (accept, reject) => {
        try {
          CucumberBaseReporter.generate(options, () => accept( null ) );
        }
        catch( error ) {
          reject( error )
        }
      });
      
    return promise;
  }

  _findTestCaseIdIntoLine( line, testCasesIdsList ) {
    let el = null;
    for( let currentId of testCasesIdsList ) {
      if( line.includes( "[" + currentId + "]" ) ) {
        el = currentId;
      }
    }
    return el;
  }

  _idToFileName( id ) {
    return id + ".html";
  }

  async _enhanceHtmlReport( htmlOutputPath, testCasesIdsList ) {
    const originalHtml = fs.readFileSync( htmlOutputPath, 'utf8' );
    const lines = originalHtml.split('\n');

    let newHtml = "";

    let currentId = null;
    for( let line of lines ) {
      let found = this._findTestCaseIdIntoLine( line, testCasesIdsList );
      
      if( found ) {
        currentId = found;
      }

      if( currentId && line.includes('<div class="panel-body">') ) {
        line += '<a target="_blank" href="' + this._idToFileName( currentId ) + '">Elenco Logs</a>';
        currentId = null;
      }
      newHtml += line;
    }
    
    fs.writeFileSync( htmlOutputPath, newHtml, 'utf8' );
  }

  async generateTestCasesLogsReports( htmlOutputPath, testCasesLogs ) {
    const testCasesIds = Object.keys( testCasesLogs );

    for( let testCaseId of testCasesIds ) {
      const testCaseData = testCasesLogs[ testCaseId ];
      this.generateOneTestCaseLogsReport( htmlOutputPath, testCaseData );
    }
  }

  async generateOneTestCaseLogsReport( htmlOutputPath, testCaseLogs ) {
    const testCaseId = testCaseLogs.testCaseId;
    let html = `<h1>${testCaseId}</h1>`;
    html += "<ul>";

    for( let httpCall of testCaseLogs.httpCalls ) {
      const logsString = httpCall.logs
                .map( el => `${el['@timestamp']} - ${el['@log']} - ${el['@message']}`)
                .join('\n');
      
      const hc = httpCall.httpCall
      html += `<li><h3>${hc.method} ${hc.url} (${hc.traceId})</h3>`
           +  `<pre>${logsString}</pre>`  
    }
    html += "</ul>";

    const fileName = this._idToFileName( testCaseId );
    const fullOutputPath = htmlOutputPath + fileName;
    fs.writeFileSync( fullOutputPath, html, 'utf8');
  }

}


exports.HtmlReportGenerator = HtmlReportGenerator;
