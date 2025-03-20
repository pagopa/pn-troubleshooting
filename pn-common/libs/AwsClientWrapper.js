const { CloudFormationClient, DescribeStacksCommand } = require("@aws-sdk/client-cloudformation");
const { CloudWatchClient, PutMetricDataCommand } = require("@aws-sdk/client-cloudwatch");
const { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand, GetLogEventsCommand } = require("@aws-sdk/client-cloudwatch-logs");
const { DynamoDBClient, QueryCommand, UpdateItemCommand, DescribeTableCommand, BatchWriteItemCommand } = require("@aws-sdk/client-dynamodb");
const { ECSClient, DescribeServicesCommand, ListClustersCommand, ListServicesCommand } = require("@aws-sdk/client-ecs");
const { EventBridgeClient, EnableRuleCommand, DisableRuleCommand, ListRulesCommand } = require("@aws-sdk/client-eventbridge");
const { KMSClient, DecryptCommand, EncryptCommand, ListKeysCommand, GetKeyRotationStatusCommand, ListResourceTagsCommand, DescribeKeyCommand, RotateKeyOnDemandCommand } = require("@aws-sdk/client-kms");
const { KinesisClient, GetRecordsCommand, GetShardIteratorCommand } = require("@aws-sdk/client-kinesis");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { SQSClient, GetQueueUrlCommand, ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand, SendMessageBatchCommand, GetQueueAttributesCommand } = require("@aws-sdk/client-sqs");
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
const { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand: AthenaGetQueryResultsCommand } = require("@aws-sdk/client-athena");
const { SSMClient, StartSessionCommand, TerminateSessionCommand } = require("@aws-sdk/client-ssm");
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { prepareKeys, prepareExpressionAttributeNames, prepareExpressionAttributeValues, prepareUpdateExpression, prepareKeyConditionExpression } = require("./dynamoUtil");
const { sleep } = require("./utils");
const { spawnSync, execSync } = require('node:child_process');
const { createHash } = require('node:crypto');

function awsClientCfg(profile) {
  const self = this;
  return {
    region: "eu-south-1",
    credentials: fromIni({
      profile: profile,
    })
  }
}

class AwsClientsWrapper {

  constructor(profile, envName) {
    this.ssoProfile;
    if (profile) {
      if (profile == 'core') {
        this.ssoProfile = `sso_pn-core-${envName}`
      }
      else if (profile == 'confinfo') {
        this.ssoProfile = `sso_pn-confinfo-${envName}`
      }
      else if (profile == 'interop') {
        this.ssoProfile = `sso_interop-safe-storage-${envName}`
      }
      this._checkAwsSsoLogin(this);
    }
    this.ssoProfile ? console.log(`AWS Wrapper initialized with ${this.ssoProfile} profile`) : console.log("AWS Wrapper initialized with LOCAL profile")
  }

  _initDynamoDB() {
    this._dynamoClient = this.ssoProfile ? new DynamoDBClient(awsClientCfg(this.ssoProfile)) : new DynamoDBClient()
  }

  _initSQS() {
    this._sqsClient = this.ssoProfile ? new SQSClient(awsClientCfg(this.ssoProfile)) : new SQSClient()
  }

  _initCloudwatch() {
    this._cloudwatchLogClient = this.ssoProfile ? new CloudWatchLogsClient(awsClientCfg(this.ssoProfile)) : new CloudWatchLogsClient()
    this._cloudwatchClient = this.ssoProfile ? new CloudWatchClient(awsClientCfg(this.ssoProfile)) : new CloudWatchClient()
  }

  _initKinesis() {
    this._kinesisClient = this.ssoProfile ? new KinesisClient(awsClientCfg(this.ssoProfile)) : new KinesisClient()
  }

  _initS3() {
    this._s3Client = this.ssoProfile ? new S3Client(awsClientCfg(this.ssoProfile)) : new S3Client()
  }

  _initCloudFormation() {
    this._cloudFormationClient = this.ssoProfile ? new CloudFormationClient(awsClientCfg(this.ssoProfile)) : new CloudFormationClient()
  }

  _initKMS() {
    this._kmsClient = this.ssoProfile ? new KMSClient(awsClientCfg(this.ssoProfile)) : new KMSClient()
  }

  _initLambda() {
    this._lambdaClient = this.ssoProfile ? new LambdaClient(awsClientCfg(this.ssoProfile)) : new LambdaClient()
  }

  _initSTS() {
    this._stsClient = this.ssoProfile ? new STSClient(awsClientCfg(this.ssoProfile)) : new STSClient()
  }

  _initEventBridge() {
    this._eventBridgeClient = this.ssoProfile ? new EventBridgeClient(awsClientCfg(this.ssoProfile)) : new EventBridgeClient();
  }

  // ECS
  _initECS() {
    this._ecsClient = this.ssoProfile ? new ECSClient(awsClientCfg(this.ssoProfile)) : new ECSClient();
  }

  _initAthena() {
    this._athenaClient = this.ssoProfile ? new AthenaClient(awsClientCfg(this.ssoProfile)) : new AthenaClient();
  }

  _initSSM() {
    this._ssmClient = this.ssoProfile ? new SSMClient(awsClientCfg(this.ssoProfile)) : new SSMClient();
  }

  _checkAwsSsoLogin(self) {
    // -----------------------
    function _osSleep(sec){
      const command = "sleep " + sec
      // const { spawnSync, execSync } = require('node:child_process');
      execSync(command);
    };

    function _awsSsoLoginSync(prof,s){
      const command = 'aws';
      const args = ['sso', 'login', `--profile=${prof}`];
      spawnSync(command, args, { stdio: 'inherit' });
      console.log("\n");
      _osSleep(s);
    };

    function _getCallerIdentitySync(prof){
      const command = 'aws';
      const args = ['sts', 'get-caller-identity','--region=eu-south-1',`--profile=${profile}`];
      return spawnSync(command, args, { stdio: 'ignore' });
    };

  // -----------------------

    const profile = self.ssoProfile;

    const resultSts = _getCallerIdentitySync(profile);
    if(resultSts.status) {
      console.log(`\nUser is not logged or token must be refreshed.\nStarting 'aws sso login --profile=${profile}' command.\n\n`
        + "-------------------------------------------------\n"
      ); 
      _awsSsoLoginSync(profile,0);
      console.log("-------------------------------------------------\n");
    }
    else {
      console.log("\nUser is SSO logged with profile '" + profile + "'\n");
    };
  };

  // Athena

  async _startQueryExecution(workGroup,db,catalog,sqlQuery) {
      const input = {
        QueryExecutionContext: { 
          Database: db,
          Catalog: catalog
        },
        QueryString: sqlQuery,
        WorkGroup: workGroup
      };
      const command = new StartQueryExecutionCommand(input);
      const result = await this._athenaClient.send(command);
      return result;
  };

  async _getQueryExecution(execId) {
      const input = { QueryExecutionId: execId };
      const command = new GetQueryExecutionCommand(input);
      const result = await this._athenaClient.send(command);
      return result;
  };

  async _getQueryResults(execId,nextToken) {
      const input = { 
        QueryExecutionId: execId,
        NextToken: nextToken 
      };
      const command = new AthenaGetQueryResultsCommand(input);
      const result = await this._athenaClient.send(command);
      return result;
  };

  // ECS

  async _listClusters() {
      const input = {};
      const command = new ListClustersCommand(input);
      const result = await this._ecsClient.send(command);
      return result;
  };

  async _listServices(cluster,maxResults,nextToken) {

      // Ref: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/ListServicesCommand/
      // min(maxResults) = 10 = default;
      // max(maxResults) = 100.

      const input = {
          cluster: cluster,
          maxResults: maxResults || 10,
          nextToken: nextToken
      };
      const command = new ListServicesCommand(input);
      const result =  await this._ecsClient.send(command);
      return result;
  };

  async _describeServices(cluster,servicesListArns) {

      // Ref: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DescribeServicesCommand/
      // La describe avviene per blocchi di 10 elementi. Questa funzione automatizza il processo.

      const input = {
          cluster: cluster,
          services: servicesListArns
      };

      const command = new DescribeServicesCommand(input);
      const  describeServices = await this._ecsClient.send(command);
      return describeServices;
  };

  // DynamoDB
  async _queryRequest(tableName, key, value) {
    const input = { // QueryInput
      TableName: tableName, // required
      KeyConditionExpression: "#k = :k",
      ExpressionAttributeNames: { // ExpressionAttributeNameMap
        "#k": key,
      },
      ExpressionAttributeValues: {
        ":k": { "S": value }
      },
    };
    const command = new QueryCommand(input);
    return await this._dynamoClient.send(command);
  }

  async _queryRequestByIndex(tableName, indexName, key, value, lastEvaluatedKey) {
    const input = { // QueryInput
      TableName: tableName, // required
      IndexName: indexName,
      KeyConditionExpression: "#k = :k",
      ExpressionAttributeNames: { // ExpressionAttributeNameMap
        "#k": key,
      },
      ExpressionAttributeValues: {
        ":k": { "S": value }
      },
    };
    lastEvaluatedKey ? input['ExclusiveStartKey'] = lastEvaluatedKey : null
    const command = new QueryCommand(input);
    return await this._dynamoClient.send(command);
  }

  async _dynamicQueryRequest(tableName, keys, logicalOperator) {
    const input = {
      TableName: tableName,
      ExpressionAttributeNames: prepareExpressionAttributeNames(keys),
      ExpressionAttributeValues: prepareExpressionAttributeValues(keys),
      KeyConditionExpression: prepareKeyConditionExpression(keys, logicalOperator),
    }
    const command = new QueryCommand(input);
    return await this._dynamoClient.send(command)
  }
  
  /* --- _updateItem Info ---

  - Per le funzioni 'prepareExpression*' vedi DinaymoUtils.js.
  - Script di esempio: https://github.com/pagopa/pn-troubleshooting/tree/main/extend_ttl_expiration
   
  Struttura variabile values:
  let values = {
    <nome attributo>: {
      codeAttr: '#<alias attribute>',
      codeValue: ':<alias value>',
      value: <expression>
    }
  }
  */

  async _updateItem(tableName, keys, values, operator,expr) {
    const input = {
      TableName: tableName,
      Key: prepareKeys(keys),
      ExpressionAttributeNames: prepareExpressionAttributeNames(values),
      ExpressionAttributeValues: prepareExpressionAttributeValues(values),
      UpdateExpression: prepareUpdateExpression(operator, values),
      ReturnValues: 'ALL_NEW'
    };
    if(expr) input.ConditionExpression = expr; 
    const command = new UpdateItemCommand(input)
    return await this._dynamoClient.send(command)
  }

  async _batchWriteItem(tableName, values) {
    const input = {
      RequestItems: {
        [tableName]: values
      }
    }
    const command = new BatchWriteItemCommand(input)
    return await this._dynamoClient.send(command)
  }

  async _describeTable(tableName) {
    const input = { // DescribeTableInput
      TableName: tableName, // required
    };
    const command = new DescribeTableCommand(input);
    return await this._dynamoClient.send(command)
  }

  async _getKeyFromSchema(tableName) {
    const tableInfo = await this._describeTable(tableName)
    return tableInfo.Table.KeySchema
  }

  // SQS
  async _getQueueUrl(queueName) {
    const input = { // GetQueueUrlRequest
      QueueName: queueName, // required
    };
    const command = new GetQueueUrlCommand(input);
    const response = await this._sqsClient.send(command);
    return response.QueueUrl;
  }

  async _getQueueAttributes(queueUrl) {
    const input = {
      QueueUrl: queueUrl,
      AttributeNames: ['All']
    };
    const command = new GetQueueAttributesCommand(input);
    return await this._sqsClient.send(command);
  }

  async _receiveMessages(queueUrl, maxNumberOfMessages, visibilityTimeout) {
    const input = { // ReceiveMessageRequest
      QueueUrl: queueUrl, // required
      AttributeNames: [ // AttributeNameList
        "All"
      ],
      MessageAttributeNames: [ // MessageAttributeNameList
        "All",
      ],
      MaxNumberOfMessages: maxNumberOfMessages,
      VisibilityTimeout: visibilityTimeout,
      WaitTimeSeconds: 5,
      //ReceiveRequestAttemptId: "STRING_VALUE",
    };
    const command = new ReceiveMessageCommand(input);
    const response = await this._sqsClient.send(command);
    return response
  }

  async _deleteMessageFromQueue(queueUrl, receiptHandle) {
    const input = { // DeleteMessageRequest
      QueueUrl: queueUrl, // required
      ReceiptHandle: receiptHandle, // required
    };
    const command = new DeleteMessageCommand(input);
    const response = await this._sqsClient.send(command);
    return response;
  }

  async _sendSQSMessage(queueUrl, body, delay, attributes, messageGroupId, messageDeduplicationId) {
    const input = { // SendMessageRequest
      QueueUrl: queueUrl, // required
      MessageBody: JSON.stringify(body), // required
      DelaySeconds: delay,
    }
    attributes ? input.MessageAttributes = attributes : null
    messageGroupId ? input.MessageGroupId = messageGroupId : null;
    messageDeduplicationId ? input.MessageDeduplicationId = messageDeduplicationId : null;
    const command = new SendMessageCommand(input);
    const response = await this._sqsClient.send(command);
    return response;
  }

  async _sendSQSMessageBatch(queueUrl, entries) {
    const input = {// SendMessageBatchRequest
      QueueUrl: queueUrl, // required
      Entries: entries
    }
    const command = new SendMessageBatchCommand(input);
    const response = await this._sqsClient.send(command);
    return response;

  }
  //Cloudwatch
  async _executeCloudwatchQuery(logGroupNames, startTime, endTime, queryString, limit) {
    const input = { // StartQueryRequest
      logGroupNames: logGroupNames,
      startTime: startTime, // required
      endTime: endTime, // required
      queryString: queryString, // required
      limit: limit
    };
    console.log(input)
    const command = new StartQueryCommand(input);
    const response = await this._cloudwatchLogClient.send(command);
    //waiting result
    let logs;
    while (!logs) {
      await sleep(1 * 1000)
      try {
        logs = await this._fetchQueryResult(response.queryId);
      }
      catch (error) {
        console.log(error);
        await sleep(20 * 1000);
      }
    }
    return logs;
  }

  async _getLogsEvents(logGroup, logStream, startDate, endDate, limit, token) {
    const input = { // GetLogEventsRequest
      logGroupName: logGroup,
      logStreamName: logStream, // required
      startTime: startDate,
      endTime: endDate,
      nextToken: token,
      limit: limit,
      startFromHead: true
    };
    const command = new GetLogEventsCommand(input);
    const response = await this._cloudwatchLogClient.send(command);
    return response;
  }

  async _fetchQueryResult(queryId) {
    const queryPollCommand = new GetQueryResultsCommand({ queryId });
    var queryPollResponse;
    queryPollResponse = await this._cloudwatchLogClient.send(queryPollCommand);

    let logs = null;
    if (!["Scheduled", "Running"].includes(queryPollResponse.status)) {
      logs = queryPollResponse.results || []
    }
    return logs;
  }

  async _putSingleMetricData(namespace, metricName, unit, value, timestamp) {
    const input = { // PutMetricDataInput
      Namespace: namespace, // required
      MetricData: [ // MetricData
        { // MetricDatum
          MetricName: metricName, // required
          Value: value,
          Unit: unit,
          Timestamp: timestamp
        },
      ]
    };
    const command = new PutMetricDataCommand(input);
    const response = await this._cloudwatchClient.send(command);
    return response;
  }

  //Kinesis
  async _getSingleShardInfo(streamName, shardId, sequenceNumber) {
    const shardIterator = await this._getShardIterator(streamName, shardId, sequenceNumber)
    const input = { // GetRecordsCommand
      ShardIterator: shardIterator,
      Limit: 1 // Number of record to read
    };
    const command = new GetRecordsCommand(input);
    const response = await this._kinesisClient.send(command);
    return response;
  }

  async _getShardIterator(streamName, shardId, sequenceNumber) {
    const input = { // GetShardIteratorCommand
      StreamName: streamName,
      ShardId: shardId,
      ShardIteratorType: "AT_SEQUENCE_NUMBER",
      StartingSequenceNumber: sequenceNumber
    };
    const command = new GetShardIteratorCommand(input);
    const response = await this._kinesisClient.send(command);
    return response.ShardIterator;
  }

  //S3
  async _getObjectCommand(bucket, fileKey) {
    const input = {
      Bucket: bucket,
      Key: fileKey,
    };

    const command = new GetObjectCommand(input);
    const response = await this._s3Client.send(command);
    return response;
  }

  async _PutObject(bucket, fileName, fileBody) {
    
    function createMd5SumHash(data) {
      // Hash necessario a causa dell'Object Lock settato sul bucket
      const hash = createHash('md5').update(data).digest('base64');
      return hash;
    };

    const input = {
      Bucket: bucket,
      Key: fileName,
      Body: fileBody,
      ContentMD5: createMd5SumHash(fileBody)
    };

    const command = new PutObjectCommand(input);
    const response = await this._s3Client.send(command);
    return response;
  }

  //CloudFormation
  async _getKeyArn(stackName) {
    const input = { // DescribeStacksInput
      StackName: stackName,
    };
    const command = new DescribeStacksCommand(input);
    const response = await this._cloudFormationClient.send(command);

    return response;
  }


  //KMS
  async _getDecryptedValue(value, kmsArn) {
    const input = { // DecryptRequest
      CiphertextBlob: Buffer.from(value, 'base64'),
      KeyId: kmsArn
    };
    const command = new DecryptCommand(input);
    const response = await this._kmsClient.send(command);

    return response;
  }

  async _getEncryptedValue(value, kmsArn) {
    const base64Value = Buffer.from(value, 'utf-8').toString('base64')
    const input = { // EncryptRequest
      Plaintext: Buffer.from(base64Value, 'base64'),
      KeyId: kmsArn
    };
    const command = new EncryptCommand(input);
    const response = await this._kmsClient.send(command);

    return response;
  }

  async _listKeyCommand(limit, marker) {
    const input = { // ListKeysRequest
      Limit: limit,
      Marker: marker
    };
    const command = new ListKeysCommand(input);
    const response = await this._kmsClient.send(command);

    return response;
  }

  //LAMBDA
  async _invokeCommand(lambdaName, invocationType, data) {
    const payload = Buffer.from(data)
    const input = { // InvocationRequest
      FunctionName: lambdaName, // required
      InvocationType: invocationType,
      Payload: payload, // e.g. Buffer.from("") or new TextEncoder().encode("")
    };
    const command = new InvokeCommand(input);
    const response = await this._lambdaClient.send(command);

    return response;
  }

  async _describeKeyCommand(keyId) {
    const input = { // GetKeyRotationStatusRequest
      KeyId: keyId, // required
    };
    const command = new DescribeKeyCommand(input);
    const response = await this._kmsClient.send(command);

    return response;
  }

  async _getKeyRotationStatusCommand(keyId) {
    const input = { // GetKeyRotationStatusRequest
      KeyId: keyId, // required
    };
    const command = new GetKeyRotationStatusCommand(input);
    const response = await this._kmsClient.send(command);

    return response;
  }

  async _listResourceTags(keyId, limit) {
    const input = { // GetKeyRotationStatusRequest
      KeyId: keyId, // required
      Limit: limit
    };
    const command = new ListResourceTagsCommand(input);
    const response = await this._kmsClient.send(command);

    return response;
  }

  async _rotateKeyOnDemand(keyId) {
    const input = { // RotateKeyOnDemandRequest
      KeyId: keyId, // required
    };
    const command = new RotateKeyOnDemandCommand(input);
    const response = await this._kmsClient.send(command);

    return response;
  }

  //STS
  async _getCallerIdentity() {
    const command = new GetCallerIdentityCommand();
    const response = await this._stsClient.send(command);

    return response;

  }

  //EVENTBRIDGE
  async _setRuleState(ruleName, enabled) {
    const CommandClass = enabled ? EnableRuleCommand : DisableRuleCommand;
    const input = {
      Name: ruleName,
      EventBusName: 'default'
    };
    const command = new CommandClass(input);
    return await this._eventBridgeClient.send(command);
  }

  async _listRules() {
    const input = {
      EventBusName: 'default',
      Limit: 10
    };
    const command = new ListRulesCommand(input);
    const response = await this._eventBridgeClient.send(command);
    return response.Rules;
  }

  async _searchRules(searchString) {
    const input = {
      EventBusName: 'default',
      Limit: 100
    };
  
    const command = new ListRulesCommand(input);
    const response = await this._eventBridgeClient.send(command);
    
    // Return all rules if no search string
    if (!searchString) {
      return response.Rules || [];
    }
  
    // Case insensitive search in name and description
    return (response.Rules || []).filter(rule => 
      rule.Name.toLowerCase().includes(searchString.toLowerCase()) ||
      (rule.Description && rule.Description.toLowerCase().includes(searchString.toLowerCase()))
    );
  }

  // SSM
  async _startSSMPortForwardingSession(target, host, portNumber, localPortNumber) {
    const input = {
      DocumentName: 'AWS-StartPortForwardingSessionToRemoteHost',
      Parameters: {
        'host': [host],
        'portNumber': [portNumber.toString()],
        'localPortNumber': [localPortNumber.toString()]
      },
      Target: target
    };
    const command = new StartSessionCommand(input);
    const response = await this._ssmClient.send(command);
    return response.SessionId;
  }

  async _terminateSSMSession(sessionId) {
    const input = {
      SessionId: sessionId
    };
    const command = new TerminateSessionCommand(input);
    return await this._ssmClient.send(command);
  }
}



module.exports = AwsClientsWrapper;
