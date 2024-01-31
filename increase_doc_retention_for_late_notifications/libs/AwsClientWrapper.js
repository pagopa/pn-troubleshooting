
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { S3Client, HeadObjectCommand, ListObjectVersionsCommand, DeleteObjectCommand, ListBucketsCommand } = require("@aws-sdk/client-s3"); 
const { DynamoDBClient, GetItemCommand, UpdateItemCommand, TransactWriteItemsCommand  } = require("@aws-sdk/client-dynamodb");
const { unmarshall, marshall } = require("@aws-sdk/util-dynamodb")

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
    this._dynamoCoreClient = new DynamoDBClient( awsClientCfg( ssoCoreProfile, profileName, roleArn ))
    this._dynamoConfinfoClient = new DynamoDBClient( awsClientCfg( ssoConfinfoProfile, profileName, roleArn ))
  }

  async _getItem(tableName, keyName, keyValue, envType = 'core'){
    const input = { // GetItemInput
      TableName: tableName, // required
      Key: { // required
        [keyName]: { // AttributeValue Union: only one key present
          S: keyValue,
        }
      }
    };

    const command = new GetItemCommand(input);
    const dbClient = envType === 'confinfo' ? this._dynamoConfinfoClient : this._dynamoCoreClient
    const response = await dbClient.send(command);
    if(response.Item){
      return unmarshall(response.Item)
    }

    return null
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
    const dbClient = envType === 'confinfo' ? this._dynamoConfinfoClient : this._dynamoCoreClient
    const res = await dbClient.send(command)
    return res
  }

  async _getBucketLists(){
    const command = new ListBucketsCommand({});
    return await this._s3Client.send(command);
  }

  async _createFutureActions(futureAction, action){
    // wrap put item of futureAction in pn-FutureAction and action in pn-Action in a transaction 
    // to ensure that both items are created or none of them

    // putItems only if primary key does not exist
    const input = {
      TransactItems: [
        {
          Put: {
            TableName: 'pn-Action',
            Item: marshall(action),
            ConditionExpression: 'attribute_not_exists(actionId)'
          }
        },
        {
          Put: {
            TableName: 'pn-FutureAction',
            Item: marshall(futureAction),
            ConditionExpression: 'attribute_not_exists(timeSlot) and attribute_not_exists(actionId)',
          }
        }
      ]
    }

    const command = new TransactWriteItemsCommand(input)
    const res = await this._dynamoCoreClient.send(command)
    return res
  }
}

exports.AwsClientsWrapper = AwsClientsWrapper;

