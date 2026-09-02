const { SQSClient } = require("@aws-sdk/client-sqs");
const { fromIni } = require("@aws-sdk/credential-provider-ini");

function buildSqsClientConfig(awsEnvironment, credentialProvider = fromIni) {
  const config = {
    region: awsEnvironment.region,
  };

  if (awsEnvironment.profile) {
    config.credentials = credentialProvider({ profile: awsEnvironment.profile });
  }
  if (awsEnvironment.endpoint) {
    config.endpoint = awsEnvironment.endpoint;
  }

  return config;
}

function createSqsClient(awsEnvironment, dependencies = {}) {
  const SqsClient = dependencies.SqsClient || SQSClient;
  const credentialProvider = dependencies.credentialProvider || fromIni;
  return new SqsClient(buildSqsClientConfig(awsEnvironment, credentialProvider));
}

module.exports = {
  buildSqsClientConfig,
  createSqsClient,
};
