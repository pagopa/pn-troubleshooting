const { AwsClientsWrapper } = require("pn-common");

function createSqsClient(awsEnvironment, dependencies = {}) {
  const Wrapper = dependencies.AwsClientsWrapper || AwsClientsWrapper;
  const client = awsEnvironment.envName === "local"
    ? new Wrapper()
    : new Wrapper("core", awsEnvironment.envName);
  client._initSQS();
  return client;
}

module.exports = {
  createSqsClient,
};
