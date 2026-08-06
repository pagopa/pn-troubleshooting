import { createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const localSecretsDirectory = fileURLToPath(new URL('../../secrets/', import.meta.url));
const secretCache = new Map();
let secretsManagerClient;

function loadPrivateKey(path) {
    return createPrivateKey({
        key: readFileSync(path, 'utf8'),
        format: 'pem',
    });
}

async function getSecretValue(secretId, jsonField) {
    if (!secretCache.has(secretId)) {
        const request = (async () => {
            const { GetSecretValueCommand, SecretsManagerClient } = await import('@aws-sdk/client-secrets-manager');
            secretsManagerClient ||= new SecretsManagerClient({});
            const response = await secretsManagerClient.send(new GetSecretValueCommand({ SecretId: secretId }));
            if (!response.SecretString) {
                throw new Error(`Secret ${secretId} does not contain SecretString`);
            }
            return response.SecretString;
        })();
        secretCache.set(secretId, request);
        request.catch(() => secretCache.delete(secretId));
    }

    const value = await secretCache.get(secretId);
    try {
        const parsed = JSON.parse(value);
        if (!(jsonField in parsed)) {
            throw new Error(`Secret ${secretId} does not contain field ${jsonField}`);
        }
        return parsed[jsonField];
    } catch (error) {
        if (error instanceof SyntaxError) {
            return value;
        }
        throw error;
    }
}

export async function getPrivateKey() {
    if (process.env.PRIVATE_KEY_SECRET_ID) {
        return createPrivateKey(await getSecretValue(
            process.env.PRIVATE_KEY_SECRET_ID,
            'clientAssertionPrivateKey'
        ));
    }
    const defaultPath = `${localSecretsDirectory}client_assertion_private.pem`;
    return loadPrivateKey(process.env.PRIVATE_KEY_PATH || defaultPath);
}

export async function getSelfcareApiKey() {
    if (process.env.SELFCARE_APIKEY) {
        return process.env.SELFCARE_APIKEY;
    }
    if (process.env.SELFCARE_APIKEY_SECRET_ID) {
        return getSecretValue(process.env.SELFCARE_APIKEY_SECRET_ID, 'selfcareApiKey');
    }
    throw new Error('SELFCARE_APIKEY or SELFCARE_APIKEY_SECRET_ID is required');
}
