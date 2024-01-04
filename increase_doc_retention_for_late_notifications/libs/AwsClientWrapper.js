
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { S3Client, HeadObjectCommand, RestoreObjectCommand } = require("@aws-sdk/client-s3"); 
const { DynamoDBClient, GetItemCommand  } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb")

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

  async _retrieveFromGlacier(bucketName, file, expiration, tier) {
    const input = { // RestoreObjectRequest
      Bucket: bucketName, // required
      Key: file, // required
      RestoreRequest: { // RestoreRequest
        Days: expiration,
        GlacierJobParameters: { // GlacierJobParameters
          Tier: tier, // required
        },
      },
    };
    try {
      const command = new RestoreObjectCommand(input);
      const res = await this._s3Client.send(command);
      return res;
    }
    catch (error) {
      return error
    }
  }
}

exports.AwsClientsWrapper = AwsClientsWrapper;

