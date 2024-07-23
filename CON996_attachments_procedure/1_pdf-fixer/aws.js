const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

function awsClientCfg(env, account) {
  const self = this;
  return {
    region: "eu-south-1",
    credentials: fromIni({
      profile: `sso_pn-${account}-${env}`,
    }),
  };
}

class AwsClientsWrapper {
  // FIXME parametri profilo e regione
  constructor(env /* dev, test, uat, prod */) {
    this._s3Client = new S3Client(awsClientCfg(env, "confinfo"));
  }

  async downloadObject(bucket, fileKey) {
    const input = {
      Bucket: bucket,
      Key: fileKey,
    };

    const response = await this._s3Client.send(new GetObjectCommand(input));

    return response;
  }
}

exports.AwsClientsWrapper = AwsClientsWrapper;
