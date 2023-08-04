
class TestCaseLogExtractor {

  constructor( awsClient ) {
    this._awsClient = awsClient;
  }

  async extractHttpCallLogs( testCases, logger ) {
    const result = {};

    const testCasesIds = testCases.listTestCasesIds();

    let tcIdx = 0;
    for( let testCaseId of testCasesIds ) {
      
      logger.log( "Start TestCase ", testCaseId, (++tcIdx), testCasesIds.length );
      result[testCaseId] = { testCaseId, httpCalls: [] };

      const callsList = testCases.listCalls( testCaseId );
      let hcIdx = 0;
      for( let httpCall of callsList ) {

        logger.log( "Fetch log for call ", httpCall.traceId, (++hcIdx), callsList.length );
        let logs = await this._awsClient.fetchSynchronousLogs( 
            httpCall.httpMethod, 
            httpCall.url, 
            httpCall.traceId, 
            httpCall.approximateEpochMs
          );
        
        result[testCaseId].httpCalls.push({ httpCall, logs })
      }
    }

    return result;
  }

}

exports.TestCaseLogExtractor = TestCaseLogExtractor;
