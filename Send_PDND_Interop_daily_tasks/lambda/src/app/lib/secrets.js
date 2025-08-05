import { createPrivateKey } from 'crypto';
import { readFileSync } from 'fs';

export async function getPrivateKey(env) {
    const keyPath = '/Users/matteo.turra/ws/PN/scripts/PDND-activate/Api-Interop/keys/' + env + '/client-test-keypair.rsa.priv';
    // Read and load private key
    const keyData = readFileSync(keyPath, 'utf8');
    const privateKey = createPrivateKey({
        key: keyData,
        format: 'pem',
    });
    return privateKey;
}

export async function getSelfcareApiKey() {
    return process.env.SELFCARE_APIKEY;
}