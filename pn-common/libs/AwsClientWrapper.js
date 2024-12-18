
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { DynamoDBClient, QueryCommand, UpdateItemCommand, DescribeTableCommand, BatchWriteItemCommand } = require("@aws-sdk/client-dynamodb");
const { SQSClient, GetQueueUrlCommand, ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand } = require("@aws-sdk/client-cloudwatch-logs");
const { CloudWatchClient, PutMetricDataCommand } = require("@aws-sdk/client-cloudwatch");
const { KinesisClient, GetRecordsCommand, GetShardIteratorCommand } = require("@aws-sdk/client-kinesis");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { CloudFormationClient, DescribeStacksCommand } = require("@aws-sdk/client-cloudformation");
const { KMSClient, DecryptCommand, EncryptCommand, ListKeysCommand, GetKeyRotationStatusCommand, ListResourceTagsCommand, DescribeKeyCommand, RotateKeyOnDemandCommand } = require("@aws-sdk/client-kms");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
const { prepareKeys, prepareExpressionAttributeNames, prepareExpressionAttributeValues, prepareUpdateExpression, prepareKeyConditionExpression } = require("./dynamoUtil");
const { sleep } = require("./utils");

function awsClientCfg( profile ) {
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
    if (profile == 'core') {
      this.ssoProfile = `sso_pn-core-${envName}`
    }
    else if (profile == 'confinfo') {
      this.ssoProfile = `sso_pn-confinfo-${envName}`
    }
    else if (profile == 'interop') {
      this.ssoProfile = `sso_interop-safe-storage-${envName}`
    }
    console.log("AWS Wrapper initialized for profile " + this.ssoProfile)
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

  // DynamoDB
  async _queryRequest(tableName, key, value){
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

  async _queryRequestByIndex(tableName, indexName, key, value, lastEvaluatedKey){
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

  async _dynamicQueryRequest(tableName, keys, logicalOperator){
    const input = {
      TableName: tableName,
      ExpressionAttributeNames: prepareExpressionAttributeNames(keys),
      ExpressionAttributeValues: prepareExpressionAttributeValues(keys),
      KeyConditionExpression: prepareKeyConditionExpression(keys, logicalOperator),
    } 
    const command = new QueryCommand(input);
    return await this._dynamoClient.send(command)
  }

  async _updateItem(tableName, keys, values, operator){
    const input = {
      TableName: tableName,
      Key: prepareKeys(keys),
      ExpressionAttributeNames: prepareExpressionAttributeNames(values),
      ExpressionAttributeValues: prepareExpressionAttributeValues(values),
      UpdateExpression: prepareUpdateExpression(operator, values),
      ReturnValues: 'ALL_NEW'
    }
    const command = new UpdateItemCommand(input)
    return await this._dynamoClient.send(command)
  }

  async _batchWriteItem(tableName, values){
    const input = {
      RequestItems: {
        [tableName]: values
      }
    }
    const command = new BatchWriteItemCommand(input)
    return await this._dynamoClient.send(command)
  }

  async _describeTable(tableName){
    const input = { // DescribeTableInput
      TableName: tableName, // required
    };
    const command = new DescribeTableCommand(input);
    return await this._dynamoClient.send(command)
  }

  async _getKeyFromSchema(tableName){
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

  async _sendSQSMessage(queueUrl, body, delay, attributes, messageGroupId, messageDeduplicationId){
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
    while( !logs ) {
      await sleep( 1 * 1000 )
      try {
        logs = await this._fetchQueryResult( response.queryId );
      }
      catch( error ) {
        console.log( error );
        await sleep( 20 * 1000 );
      }
    }
    return logs;
  }

  async _fetchQueryResult( queryId ) {
    const queryPollCommand = new GetQueryResultsCommand({ queryId });
    var queryPollResponse;
    queryPollResponse = await this._cloudwatchLogClient.send( queryPollCommand );

    let logs = null;
    if( ! ["Scheduled", "Running"].includes( queryPollResponse.status )) {
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

  //CloudFormation
  async _getKeyArn(stackName){
    const input = { // DescribeStacksInput
        StackName: stackName,
      };
    const command = new DescribeStacksCommand(input);
    const response = await this._cloudFormationClient.send(command);

    return response;
  }


  //KMS
  async _getDecryptedValue(value, kmsArn){
    const input = { // DecryptRequest
        CiphertextBlob: Buffer.from(value, 'base64'), 
        KeyId: kmsArn
    };
    const command = new DecryptCommand(input);
    const response = await this._kmsClient.send(command);

    return response;
  }

  async _getEncryptedValue(value, kmsArn){
    const base64Value = Buffer.from(value, 'utf-8').toString('base64')
    const input = { // EncryptRequest
      Plaintext: Buffer.from(base64Value, 'base64'), 
      KeyId: kmsArn
    };
    const command = new EncryptCommand(input);
    const response = await this._kmsClient.send(command);

    return response;
  }

  async _listKeyCommand(limit, marker){
    const input = { // ListKeysRequest
      Limit: limit,
      Marker: marker
    };
    const command = new ListKeysCommand(input);
    const response = await this._kmsClient.send(command);

    return response;
  }
 
  //LAMBDA
  async _invokeCommand(lambdaName, invocationType, data){
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

  async _describeKeyCommand(keyId){
    const input = { // GetKeyRotationStatusRequest
      KeyId: keyId, // required
    };
    const command = new DescribeKeyCommand(input);
    const response = await this._kmsClient.send(command);

    return response;
  }

  async _getKeyRotationStatusCommand(keyId){
    const input = { // GetKeyRotationStatusRequest
      KeyId: keyId, // required
    };
    const command = new GetKeyRotationStatusCommand(input);
    const response = await this._kmsClient.send(command);

    return response;
  }

  async _listResourceTags(keyId, limit){
    const input = { // GetKeyRotationStatusRequest
      KeyId: keyId, // required
      Limit: limit
    };
    const command = new ListResourceTagsCommand(input);
    const response = await this._kmsClient.send(command);

    return response;
  }

  async _rotateKeyOnDemand(keyId){
    const input = { // RotateKeyOnDemandRequest
      KeyId: keyId, // required
    };
    const command = new RotateKeyOnDemandCommand(input);
    const response = await this._kmsClient.send(command);

    return response;
  }
  
  //STS
  async _getCallerIdentity(){
    const command = new GetCallerIdentityCommand();
    const response = await this._stsClient.send(command);

    return response;
  }
}

module.exports = AwsClientsWrapper;
