"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.awsClientConfig = void 0;
var _utils = require("./utils.cjs");
var _credentialProviders = require("@aws-sdk/credential-providers");
var _clientSts = require("@aws-sdk/client-sts");
var _env = require("./env.cjs");
const AssumeRoleArnNotDefinedError = (0, _utils.createCustomError)('AssumeRoleArnNotDefinedError');
const stsRegion = 'eu-south-1';
const confinofAssumeRoleArn = (0, _env.getAssumeRoleConfinfoArn)();

/**
 * Gets temporary security credentials by assuming confinfo IAM role.
 *
 * @return {Promise<Object>} Temporary security credentials: Access Key ID,
 * Secret Access Key and Session Token
 */
const getConfinfoCredentials = async () => {
  if (!confinofAssumeRoleArn) {
    throw new AssumeRoleArnNotDefinedError('AssumeRole arn not defined in env vars.');
  }
  const stsClient = new _clientSts.STSClient({
    region: stsRegion
  });
  const assumeRoleCommand = new _clientSts.AssumeRoleCommand({
    RoleArn: confinofAssumeRoleArn,
    RoleSessionName: 'DiagnosticGenericSession'
  });
  const {
    Credentials
  } = await stsClient.send(assumeRoleCommand);
  return {
    accessKeyId: Credentials.AccessKeyId,
    secretAccessKey: Credentials.SecretAccessKey,
    sessionToken: Credentials.SessionToken
  };
};

/**
 * Configures the AWS client based on the environment (local or Lambda) and the
 * specified profile.
 *
 * @param {string} profile The profile name, which influences the credential
 * source. Expected values include 'core' or 'confinfo'.
 * @param {string} region The region where the credentials are taken.
 * @return {Object} Configuration object for AWS clients, including region and
 * credentials.
 * @throws {Error} If the profile parameter does not match expected values
 * ('core' or 'confinfo').
 */
// profile ['*core*', '*confinfo*']
const awsClientConfig = (profile, region) => {
  let credentials;
  if ((0, _utils.isLocalEnvironment)()) {
    credentials = (0, _credentialProviders.fromIni)({
      profile
    });
  } else {
    // Assume that lambda runs on core
    if (profile.includes('core')) {
      credentials = (0, _credentialProviders.fromEnv)();
      region = (0, _env.getCurrentRegion)();
    } else if (profile.includes('confinfo')) {
      credentials = getConfinfoCredentials();
    } else {
      throw new Error(`Profile ${profile} not in [core, confinfo]`);
    }
  }
  return {
    region,
    credentials
  };
};
exports.awsClientConfig = awsClientConfig;