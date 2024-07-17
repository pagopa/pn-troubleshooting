
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { DynamoDBClient, QueryCommand, UpdateItemCommand, DescribeTableCommand } = require("@aws-sdk/client-dynamodb");
const { SQSClient, GetQueueUrlCommand, ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand, DescribeLogGroupsCommand } = require("@aws-sdk/client-cloudwatch-logs");
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
    if (profile == 'core') {
      this.ssoProfile = `sso_pn-core-${envName}`
    }
    else {
      this.ssoProfile = `sso_pn-confinfo-${envName}`
    }
    console.log("AWS Wrapper initialized for profile " + this.ssoProfile)
  }

  _initDynamoDB() {
    this._dynamoClient = new DynamoDBClient( awsClientCfg( this.ssoProfile ));
  }

  _initSQS() {
    this._sqsClient = new SQSClient( awsClientCfg( this.ssoProfile ));
  }
  
  _initCloudwatch() {
    this._cloudwatchClient = new CloudWatchLogsClient( awsClientCfg( this.ssoProfile ));
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

  async _sendSQSMessage(queueUrl, body, delay){
    const input = { // SendMessageRequest
      QueueUrl: queueUrl, // required
      MessageBody: JSON.stringify(body), // required
      DelaySeconds: delay,
    }
    console.log(input)
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
    const response = await this._cloudwatchClient.send(command);
    //waiting result
    console.log(response)
    let logs = null;
    while( !logs ) {
      await sleep( 1 * 1000 )
      try {
        logs = await this._fetchQueryResult( response.queryId );
      }
      catch( error ) {
        console.log( error );
        await sleep( 20 * 1000 );
      }
      console.log(logs)
    }
    return logs;
  }

  async _fetchQueryResult( queryId ) {
    const queryPollCommand = new GetQueryResultsCommand({ queryId });
    var queryPollResponse;
    queryPollResponse = await this._cloudwatchClient.send( queryPollCommand );

    let logs = null;
    if( ! ["Scheduled", "Running"].includes( queryPollResponse.status )) {
      logs = queryPollResponse.results || []
    }
    return logs;
  }
}

module.exports = AwsClientsWrapper;
