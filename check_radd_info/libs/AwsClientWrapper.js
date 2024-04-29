
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { S3Client, HeadObjectCommand, ListBucketsCommand, GetObjectCommand } = require("@aws-sdk/client-s3");

function awsClientCfg( profile ) {
  const self = this;
  //if(!profileName){
    return { 
      region: "eu-south-1", 
      credentials: fromIni({ 
        profile: profile,
      })
    }
  //}
}

class AwsClientsWrapper {

  constructor( envName, profileName, roleArn ) {
    const ssoConfInfoProfile = `sso_pn-confinfo-${envName}`
    const ssoCoreProfile = `sso_pn-core-${envName}`
    this._dynamoClient = new DynamoDBClient( awsClientCfg( ssoCoreProfile, profileName, roleArn ));
    this._s3Client = new S3Client( awsClientCfg( ssoConfInfoProfile, profileName, roleArn ));

  }

  async _queryRequest(tableName, key, value, projection){
    const input = { // QueryInput
      TableName: tableName, // required
      ProjectionExpression: projection,
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

  async _getHeadObject(bucketName, key){
    const input = { // HeadObjectRequest
      Bucket: bucketName, // required
      Key: key, // required
    };
    const command = new HeadObjectCommand(input);
    return await this._s3Client.send(command);
  }

  async _getBucketLists(){
    const command = new ListBucketsCommand({});
    return await this._s3Client.send(command);
  }

  async _getObject(bucketName, key){
    const input = { // HeadObjectRequest
      Bucket: bucketName, // required
      Key: key, // required
    };
    const command = new GetObjectCommand(input);
    return await this._s3Client.send(command);
  }
}

exports.AwsClientsWrapper = AwsClientsWrapper;
