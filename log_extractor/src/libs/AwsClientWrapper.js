const { APIGatewayClient, GetDomainNamesCommand, GetBasePathMappingsCommand, GetStageCommand } = require("@aws-sdk/client-api-gateway");
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { STSClient, AssumeRoleCommand } = require("@aws-sdk/client-sts");
const { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand, DescribeLogGroupsCommand } = require("@aws-sdk/client-cloudwatch-logs");
const { QueryCommand, DynamoDBDocumentClient, PutCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { SQSClient, ListQueuesCommand, ReceiveMessageCommand } = require("@aws-sdk/client-sqs");

function awsClientCfg( profile, profileName, roleArn ) {
  const self = this;
  if(!profileName){
    return { 
      region: "eu-south-1", 
      credentials: fromIni({ 
        profile: profile,
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

  getApiGwLogGroups( url ) {
    
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
    return matchingMapping ? matchingMapping.logGroups: []
    
  }
    
}

class AwsClientsWrapper {

  constructor( envName, profileName, roleArn ) {
    /*this._cloudWatchClient = new CloudWatchLogsClient( awsClientCfg( envName, profileName, roleArn ));
    this._apiGwClient = new APIGatewayClient( awsClientCfg( envName, profileName, roleArn ));
    this._dynamoClient = new DynamoDBClient( awsClientCfg( envName, profileName, roleArn ));*/
    const ssoCoreProfile = `sso_pn-core-${envName}`
    const ssoConfinfoProfile = `sso_pn-confinfo-${envName}`
    this._cloudWatchClient = {
      core: new CloudWatchLogsClient( awsClientCfg( ssoCoreProfile, profileName, roleArn )),
      confinfo: new CloudWatchLogsClient( awsClientCfg( ssoConfinfoProfile, profileName, roleArn ))
    } 
    this._apiGwClient = new APIGatewayClient( awsClientCfg( ssoCoreProfile, profileName, roleArn ));
    this._dynamoClient = {
      core: new DynamoDBClient( awsClientCfg( ssoCoreProfile, profileName, roleArn )),
      confinfo: new DynamoDBClient( awsClientCfg( ssoConfinfoProfile, profileName, roleArn ))
    };
    this._sqsClient = {
      core: new SQSClient( awsClientCfg( ssoCoreProfile, profileName, roleArn )),
      confinfo: new SQSClient( awsClientCfg( ssoConfinfoProfile, profileName, roleArn ))
    } ;
  }

  async init() {
    this._apiGwMappings = await this._fetchAllApiGwMappings();
    this._ecsLogGroupsNames = await this._fetchEcsLogGroups();
    this._sqsNames = await this._fetchAllSQS();
  }

x
  _getProfileByECS(logGroupName) {
    return this._ecsLogGroupsNames.core.includes(logGroupName) ? "core" : "confinfo"
  }

  _getProfileBySQS(sqsName) {
    return sqsName in this._sqsNames.core ? "core" : "confinfo"
  }

  async _scheduleQueryAccount(profile, logGroupNames, queryString, fromEpochMs, toEpochMs) {
    let query = {
      logGroupNames: logGroupNames,
      queryString, 
      startTime: fromEpochMs, 
      endTime: toEpochMs
    }
    console.log(query)
    const scheduleQueryCoreCommand = new StartQueryCommand(query);
    return await this._cloudWatchClient[profile].send( scheduleQueryCoreCommand ); 
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

  async _elabSqsNameUrl(profile){
    const input = { // ListQueuesRequest
      QueueNamePrefix: ""
    };
    const command = new ListQueuesCommand(input);
    const res = await this._sqsClient[profile].send( command )
    let sqs = {}
    res.QueueUrls.forEach(value=> {
      let key = value.substring(value.lastIndexOf("/") + 1)
      sqs[key] = value
    })
    return sqs
  }

  async _fetchAllSQS() {
    let sqsValue = {
      core: [],
      confinfo: []
    }
    sqsValue.core = await this._elabSqsNameUrl("core")
    sqsValue.confinfo = await this._elabSqsNameUrl("confinfo")
    return sqsValue
  }


  /**
   * List all LogGroup that contains log of ECS microservices
   * @returns a list of log-group names
   */
  async _fetchEcsLogGroups() {
    const logGroupNamePrefix = '/aws/ecs/pn';
    const listEcsLogGroupsCommand = new DescribeLogGroupsCommand({ logGroupNamePrefix, limit: 50 });
    
    const ecsLogGroups = {
      core: await this._cloudWatchClient.core.send( listEcsLogGroupsCommand ),
      confinfo: await this._cloudWatchClient.confinfo.send( listEcsLogGroupsCommand )
    }
    const ecsLogGroupsNames = {
      core: ecsLogGroups.core.logGroups.map( el => el.logGroupName ),
      confinfo: ecsLogGroups.confinfo.logGroups.map( el => el.logGroupName )
    }
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
  async executeLogInsightQuery( profile, logGroupNames, fromEpochMs, toEpochMs, queryString ) {

    const scheduleQueryCommand = new StartQueryCommand({ 
          logGroupNames, queryString,
          startTime: fromEpochMs, 
          endTime: toEpochMs 
        });
    
    const queryScheduleResponse = await this._cloudWatchClient[profile].send( scheduleQueryCommand );
    let logs = null;
    
    while( !logs ) {
      await sleep( 1 * 1000 )
      try {
        logs = await this._fetchQueryResult( profile, queryScheduleResponse.queryId );
      }
      catch( error ) {
        console.log( error );
        await sleep( 20 * 1000 );
      }
    }
    
    return this._remapLogQueryResults( logs );
  }

  // FIXME: same result for cancelled query and empty result set
  async _fetchQueryResult( profile, queryId ) {
    const queryPollCommand = new GetQueryResultsCommand({ queryId });
    var queryPollResponse;
    queryPollResponse = await this._cloudWatchClient[profile].send( queryPollCommand );

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


  async fetchSynchronousLogs( profile, url, traceId, fromEpochMs, toEpochMs ) {
    
    const apiGwLogGroups = this._apiGwMappings.getApiGwLogGroups( url );
    
    const logsForRequestId = await this.executeLogInsightQuery( 
        profile, apiGwLogGroups, fromEpochMs, toEpochMs, 
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
    
    const allLogGroupsNames = [ ... apiGwLogGroups, ... this._ecsLogGroupsNames.core, ... this._ecsLogGroupsNames.confinfo ]
    const fullQueryResult = await this.executeLogInsightQuery( 
      profile, allLogGroupsNames, fromEpochMs, toEpochMs, 
      `fields @timestamp, @log, message | sort @timestamp asc | filter ${fullQueryFilterClause}`
    );
  
    return fullQueryResult;
  }
        
  async getTraceIDsByQuery(logGroupNames, fromEpochMs, toEpochMs, queryString, limit) {
    let query = {
      logGroupNames, 
      queryString, 
      startTime: fromEpochMs, 
      endTime: toEpochMs
    }
    console.log(query)
    const scheduleQueryCommand = new StartQueryCommand(query);
    var profile = "core"
    if(logGroupNames[0].includes("ecs")){
      profile = this._getProfileByECS(logGroupNames[0]);
    }
    const queryScheduleResponse = await this._cloudWatchClient[profile].send( scheduleQueryCommand );
    let logs = null;
    console.log(queryScheduleResponse.queryId)
    while( !logs ) {
      await sleep( 1 * 1000 )
      try {
        logs = await this._fetchQueryResult( profile , queryScheduleResponse.queryId );
      }
      catch( error ) {
        console.log( error );
        await sleep( 20 * 1000 );
      }
    }
    var trace_ids = []
    var res = this._remapLogQueryResults( logs );
    console.log(res)
    res.forEach( el => {
      console.log("ELPIPITO." + JSON.stringify(el))
      if(el.trace_id) {
        console.log("INT")
        if(el.trace_id.split(";").length > 1) {
          let t = el.trace_id.split("Root=")[1];
          trace_ids.push(t.substring(0, t.indexOf(";")))
        }
        else {
          trace_ids.push(el.trace_id.replace("Root=", ""))
        }
      }
    })
    console.log(trace_ids)
    if (trace_ids.length > 0) {
      return {
        logs: await this._getLogsByTraceIdsMultipleAccount(logGroupNames, fromEpochMs, toEpochMs, trace_ids.slice(0, limit)),
        trace_ids: trace_ids.slice(limit)
      }
    }
  }
  
  async _getLogsByTraceIdsMultipleAccount(logGroupNames, fromEpochMs, toEpochMs, traceIds) {
    let queryString = "fields @timestamp, @log, @message | filter "
    traceIds.map( el => queryString = queryString + "@message like \"" + el.replace("Root=", "") +"\" or " );
    queryString = queryString.substring(0, queryString.length - 3) + " | sort @timestamp desc"
    console.log(queryString)
    var profile = "core"
    if(logGroupNames[0].includes("ecs")){
      profile = this._getProfileByECS(logGroupNames[0]);
    }
    const completeLogGroupsNames = logGroupNames.concat(this._ecsLogGroupsNames[profile]);
    var query = {
      "core": null,
      "confinfo": null
    }
    if (profile == "core"){
      
      query[profile] = await this._scheduleQueryAccount(profile, completeLogGroupsNames.concat("/aws/events/core-event-bus-input-events"), queryString, fromEpochMs, toEpochMs)
      query["confinfo"] = await this._scheduleQueryAccount("confinfo", this._ecsLogGroupsNames["confinfo"], queryString, fromEpochMs, toEpochMs)
    }
    else {
      query[profile] = await this._scheduleQueryAccount(profile, completeLogGroupsNames, queryString, fromEpochMs, toEpochMs)
      query["core"] = await this._scheduleQueryAccount("core", this._ecsLogGroupsNames["core"], queryString, fromEpochMs, toEpochMs)
    }
    
    let coreLogs = null
    let confinfoLogs = null

    while( !coreLogs || !confinfoLogs) {
      await sleep( 1 * 1000 )
      try {
        coreLogs = await this._fetchQueryResult( "core", query["core"].queryId );
        confinfoLogs = await this._fetchQueryResult( "confinfo", query["confinfo"].queryId );
      }
      catch( error ) {
        console.log( error );
        await sleep( 20 * 1000 );
      }
    }
    const logs = coreLogs.concat(confinfoLogs);
    return this._remapLogQueryResults( logs ).sort((a, b) => new Date(a['@timestamp']) - new Date(b['@timestamp']));
  }

  async getEventsByDLQ(queueName) {
    const profile = this._getProfileBySQS(queueName)
    const queueUrl = this._sqsNames[profile][queueName]
    const input = { // ReceiveMessageRequest
      QueueUrl: queueUrl, // required
      MaxNumberOfMessages: 10,
      VisibilityTimeout: 15,
      WaitTimeSeconds: 3
    };
    const command = new ReceiveMessageCommand(input);
    const response = await this._sqsClient[profile].send(command);
    const sampledMessage = response.Messages
    console.log("There are " + response.Messages.length + " message(s) sampled")
    return sampledMessage
  }
}


exports.AwsClientsWrapper = AwsClientsWrapper;

