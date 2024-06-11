
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { DynamoDBClient, QueryCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { S3Client, HeadObjectCommand, ListObjectVersionsCommand, DeleteObjectCommand, ListBucketsCommand } = require("@aws-sdk/client-s3"); 
const { marshall } = require('@aws-sdk/util-dynamodb');

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
    const ssoConfinfoProfile = `sso_pn-confinfo-${envName}`
    const ssoCoreProfile = `sso_pn-core-${envName}`
    this._s3Client = new S3Client( awsClientCfg( ssoConfinfoProfile, profileName, roleArn ));
    this._dynamoClient = {
      'core': new DynamoDBClient( awsClientCfg( ssoCoreProfile, profileName, roleArn )),
      'confinfo': new DynamoDBClient( awsClientCfg( ssoConfinfoProfile, profileName, roleArn ))
    }
  }

  async _queryRequest(tableName, key, value, projection, profile){
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
    return await this._dynamoClient[profile].send(command);
  }

  async _getBucketLists(){
    const command = new ListBucketsCommand({});
    return await this._s3Client.send(command);
  }

  async _checkS3Exists(bucketName, file){
    const input = { // GetItemInput
      Bucket: bucketName, // required
      Key: file, // required
    };
    const command = new HeadObjectCommand(input);
    const res = await this._s3Client.send(command);
    return res
  }  

  async _getDeletionMarkerVersion(bucketName, fileKey){
    const input = {
      Bucket: bucketName,
      Prefix: fileKey
    }
    const command = new ListObjectVersionsCommand(input)
    const res = await this._s3Client.send(command)

    const versionId = res.DeleteMarkers?.find(el => el.Key === fileKey && el.IsLatest === true )?.VersionId
    return versionId
  }

  async _removeDeletionMarker(bucketName, fileKey, versionId){
    const input = {
      Bucket: bucketName,
      Key: fileKey,
      VersionId: versionId
    }
    const command = new DeleteObjectCommand(input)
    const res = await this._s3Client.send(command)
    return res
  }

  async _updateItem(tableName, keyName, keyValue, updateExpression, expressionAttributeValues, envType = 'core'){
    
    const input = {
      TableName: tableName,
      Key: {
        [keyName]: marshall(keyValue)
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    }
    const command = new UpdateItemCommand(input)
    const res = await this._dynamoClient[envType].send(command)
    console.log(res)
    return res
  }

  async _checkS3Exists(bucketName, file){
    const input = { // GetItemInput
      Bucket: bucketName, // required
      Key: file, // required
    };
    const command = new HeadObjectCommand(input);
    const res = await this._s3Client.send(command);
    return res
  }
}

exports.AwsClientsWrapper = AwsClientsWrapper;
