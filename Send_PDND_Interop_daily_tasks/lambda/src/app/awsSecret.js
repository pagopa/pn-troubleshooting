import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

/**
 * Fetch a secret string from AWS Secrets Manager
 * @param {string} secretName - Name or ARN of the secret
 * @returns {Promise<string>} - The secret value (e.g., private key PEM)
 */
export async function getSecretValue(secretName) {
  const client = new SecretsManagerClient();

  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await client.send(command);

    if ('SecretString' in response) {
      return response.SecretString;
    } else {
      throw new Error('Secret binary format not supported in this function.');
    }
  } catch (error) {
    console.error(`Error retrieving secret: ${error.message}`);
    throw error;
  }
}
