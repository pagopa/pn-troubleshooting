
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { S3Client, RestoreObjectCommand } = require("@aws-sdk/client-s3"); 

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
    const ssoProfile = `sso_pn-confinfo-${envName}`
    this._s3Client = new S3Client( awsClientCfg( ssoProfile, profileName, roleArn ));
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

