const { APIGatewayClient, GetDomainNamesCommand, GetBasePathMappingsCommand, GetStageCommand } = require("@aws-sdk/client-api-gateway");
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { STSClient, AssumeRoleCommand } = require("@aws-sdk/client-sts");
const { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand, DescribeLogGroupsCommand } = require("@aws-sdk/client-cloudwatch-logs");
const { QueryCommand, DynamoDBDocumentClient, PutCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
function awsClientCfg( envName, profileName, roleArn ) {
  const self = this;
  if(!profileName){
    return { 
      region: "eu-south-1", 
      credentials: fromIni({ 
        profile: `sso_pn-confinfo-${envName}`,
      })
    }
  }else{
    return { 
      region: "eu-south-1", 
      credentials: fromIni({ 
        profile: profileName,
        roleAssumer: async (sourceCredentials, params) => {
          const stsClient = new STSClient({ credentials: sourceCredentials });
          const command = new AssumeRoleCommand({
            RoleArn: roleArn,
            RoleSessionName: "session1"
          });
          const response = await stsClient.send(command);
          return {
            accessKeyId: response.Credentials.AccessKeyId,
            secretAccessKey: response.Credentials.SecretAccessKey,
            sessionToken: response.Credentials.SessionToken,
            expiration: response.Credentials.Expiration
          };
        }
      })
    }
  }
}

async function sleep( ms ) {
  return new Promise( ( accept, reject) => {
    setTimeout( () => accept(null) , ms );
  })
}



class CustomDomainsMappings {

  constructor() {
    this._mappings = {}
  }

  addMapping( domain, path, apiId, logGroups ) {
    let domainMappings = this._mappings[ domain ];
    
    if( ! domainMappings ) {
      domainMappings = []
      this._mappings[ domain ] = domainMappings;
    }

    domainMappings.push({ domain, path, apiId, logGroups });
  }

  getApiGwLogGroups( httpMethod, url  ) {
    
    let domain = url.replace(/https:\/\//, "").replace(/\/.*/, "");
    let urlPath = url.replace(/https:\/\//, "").replace(/[^/]+\//, "");
    
    const domainMappings = this._mappings[ domain ];
    
    let matchingMapping = null;
    if( domainMappings ) {
      
      // - Match prefix
      for( let m of domainMappings ) {
        if( m.domain == domain && urlPath.startsWith(m.path) ) {
          matchingMapping = m;
        } 
      }

      // - Match with "root" mapping if present
      if( ! matchingMapping ) {
        for( let m of domainMappings ) {
          if( m.domain == domain && m.path == "(none)" ) {
            matchingMapping = m;
          }
        }
      }
    }
    console.log(matchingMapping)
    return matchingMapping ? matchingMapping.logGroups: []
    
  }
    
}

class AwsClientsWrapper {

  constructor( envName, profileName, roleArn ) {
    this._cloudWatchClient = new CloudWatchLogsClient( awsClientCfg( envName, profileName, roleArn ));
    this._apiGwClient = new APIGatewayClient( awsClientCfg( envName, profileName, roleArn ));
    this._dynamoClient = new DynamoDBClient( awsClientCfg( envName, profileName, roleArn ));
  }

  async init() {
    this._apiGwMappings = await this._fetchAllApiGwMappings();
    this._ecsLogGroupsNames = await this._fetchEcsLogGroups();
  }

  /**
   * Connect to AWS and read the information needed to figure out which 
   * REST API serve an HTTP Request.
   * 
   * See https://pagopa.atlassian.net/wiki/spaces/PN/pages/704676100/R+5+Diagnostica+Invocazione+alle+API+di+Piattaforma+Notifiche#Individuare-l%E2%80%99API-invocata-su-API-Gateway
   * @returns 
   */
  async _fetchAllApiGwMappings() {
    const stageName = "unique";

    const domainListCommand = new GetDomainNamesCommand( { limit: 50 } );
    const domainsListResponse = await this._apiGwClient.send( domainListCommand );

    const allMappings = new CustomDomainsMappings();

    for( let domain of domainsListResponse.items ) {
      const domainName = domain.domainName;
      const domainMappingsCommand = new GetBasePathMappingsCommand( { domainName, limit: 50 } );
      const domainMappingsResponse = await this._apiGwClient.send( domainMappingsCommand );
      
      const domainMappingList = domainMappingsResponse?.items || []
      for( let mapping of domainMappingList ) {
        const restApiId = mapping.restApiId;
        
        const getStageCommand = new GetStageCommand({ restApiId, stageName })
        const stage = await this._apiGwClient.send( getStageCommand );
        
        const accessLogGroupArn = stage.accessLogSettings.destinationArn;
        const accessLogGroupName = accessLogGroupArn.replace(/.*:/, "");
        const execLogGroupName = `API-Gateway-Execution-Logs_${restApiId}/${stageName}`;
        const logGroups = [ accessLogGroupName, execLogGroupName ];

        allMappings.addMapping( domainName, mapping.basePath, restApiId, logGroups );
      }
    }
    return allMappings;
  }

  /**
   * List all LogGroup that contains log of ECS microservices
   * @returns a list of log-group names
   */
  async _fetchEcsLogGroups() {
    const logGroupNamePrefix = '/aws/ecs/';
    const listEcsLogGroupsCommand = new DescribeLogGroupsCommand({ logGroupNamePrefix, limit: 50 });
    
    const ecsLogGroups = await this._cloudWatchClient.send( listEcsLogGroupsCommand );
    const ecsLogGroupsNames = ecsLogGroups.logGroups.map( el => el.logGroupName );
    return ecsLogGroupsNames;
  }

  /**
   * Execute a LogInsight query and download results.
   * N.B.: This implementation do not use parallelization. Yes, it is very slow.
   * @param {Execute query inside listed Log Groups } logGroupNames 
   * @param {Log scan time range starting point} fromEpochMs 
   * @param {Log scan time range end} toEpochMs 
   * @param {LogInsight query} queryString 
   * @returns 
   */
  async executeLogInsightQuery( logGroupNames, fromEpochMs, toEpochMs, queryString ) {
    const scheduleQueryCommand = new StartQueryCommand({ 
          logGroupNames, queryString,
          startTime: fromEpochMs, 
          endTime: toEpochMs 
        });
    
    const queryScheduleResponse = await this._cloudWatchClient.send( scheduleQueryCommand );
    let logs = null;
    
    while( !logs ) {
      await sleep( 1 * 1000 )
      try {
        logs = await this._fetchQueryResult( queryScheduleResponse.queryId );
      }
      catch( error ) {
        console.log( error );
        await sleep( 20 * 1000 );
      }
    }
    
    return this._remapLogQueryResults( logs );
  }

  // FIXME: same result for cancelled query and empty result set
  async _fetchQueryResult( queryId ) {
    const queryPollCommand = new GetQueryResultsCommand({ queryId });
    const queryPollResponse = await this._cloudWatchClient.send( queryPollCommand );

    let logs = null;
    if( ! ["Scheduled", "Running"].includes( queryPollResponse.status )) {
      logs = queryPollResponse.results || []
    }
    return logs;
  }

  _remapLogQueryResults( results ) {
    return results
        .map( fieldsArray => {
          const obj = {}
          fieldsArray.forEach( field => { obj[field.field] = field.value})
          return obj;
        });
  }


  async fetchSynchronousLogs( httpMethod, url, traceId, approximateEpochMs ) {
    
    const apiGwLogGroups = this._apiGwMappings.getApiGwLogGroups( httpMethod, url );
    
    const logsForRequestId = await this.executeLogInsightQuery( 
        apiGwLogGroups, approximateEpochMs.start, approximateEpochMs.end, 
        "sort @timestamp asc | filter( @message =~ \"" + traceId + "\")"
      );
    
    const logsWithRequestId = logsForRequestId
      .map( el => el["@message"] )
      .filter( el => el.includes("X-ray Tracing ID : Root="))
    
    
    let fullQueryFilterClause =  "(@message =~ \"" + traceId + "\") "
    if( logsWithRequestId.length > 0 ) {
      const requestId = logsWithRequestId[0].replace(/\).*/, "").replace("(", "");
      fullQueryFilterClause = 
          "( " + fullQueryFilterClause 
                    + " or (@message =~ \"" + requestId + "\") )";
    }
    
    const allLogGroupsNames = [ ... apiGwLogGroups, ... this._ecsLogGroupsNames ]
    const fullQueryResult = await this.executeLogInsightQuery( 
      allLogGroupsNames, approximateEpochMs.start, approximateEpochMs.end, 
      `fields @timestamp, @log, @message | sort @timestamp asc | filter ${fullQueryFilterClause}`
    );
  
    return fullQueryResult;
  }
  
}


exports.AwsClientsWrapper = AwsClientsWrapper;

