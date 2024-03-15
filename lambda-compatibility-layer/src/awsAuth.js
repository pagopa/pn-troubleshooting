import { isLocalEnvironment } from "./utils.js";
import { fromIni, fromEnv } from "@aws-sdk/credential-providers";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { createCustomError } from "./utils.js";
import { getAssumeRoleConfinfoArn, getConfinfoRegion } from "./env.js";

const AssumeRoleArnNotDefinedError = createCustomError(
  "AssumeRoleArnNotDefinedError"
);

const region = getConfinfoRegion() ?? "eu-south-1";
const confinofAssumeRoleArn = getAssumeRoleConfinfoArn(); // TODO

/**
 * Gets temporary security credentials by assuming confinfo IAM role.
 *
 * @return {Promise<Object>} Temporary security credentials: Access Key ID,
 * Secret Access Key and Session Tokenß
 */
const getConfinfoCredentials = async () => {
  if (!confinofAssumeRoleArn) {
    throw new AssumeRoleArnNotDefinedError(
      "AssumeRole arn not defined in env vars."
    );
  }
  const stsClient = new STSClient({ region: region });
  const assumeRoleCommand = new AssumeRoleCommand({
    RoleArn: confinofAssumeRoleArn,
    RoleSessionName: "DiagnosticGenericSession",
  });

  const { Credentials } = await stsClient.send(assumeRoleCommand);
  return {
    accessKeyId: Credentials.AccessKeyId,
    secretAccessKey: Credentials.SecretAccessKey,
    sessionToken: Credentials.SessionToken,
  };
};

/**
 * Configures the AWS client based on the environment (local or Lambda) and the
 * specified profile.
 *
 * @param {string} profile The profile name, which influences the credential
 * source. Expected values include 'core' or 'confinfo'.
 * @return {Object} Configuration object for AWS clients, including region and
 * credentials.
 * @throws {Error} If the profile parameter does not match expected values
 * ('core' or 'confinfo').
 */
// profile ['*core*', '*confinfo*']
export const awsClientConfig = (profile) => {
  let credentials;
  if (isLocalEnvironment()) {
    credentials = fromIni({ profile });
  } else {
    // Assume that lambda runs on core
    if (profile.includes("core")) {
      credentials = fromEnv();
    } else if (profile.includes("confinfo")) {
      credentials = getConfinfoCredentials();
    } else {
      throw new Error(`Profile ${profile} not in [core, confinfo]`);
    }
  }
  return {
    region,
    credentials,
  };
};