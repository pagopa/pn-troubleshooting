import { createHash, createPublicKey, generateKeyPair, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';

export function generateDpopPrivateKey() {
    return new Promise((resolve, reject) => {
        generateKeyPair('rsa', {
            modulusLength: 2048,
            publicExponent: 0x10001,
        }, (error, _publicKey, privateKey) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(privateKey);
        });
    });
}

function publicJwkFromPrivateKey(privateKey) {
    const publicJwk = createPublicKey(privateKey).export({ format: 'jwk' });
    return {
        kty: publicJwk.kty,
        n: publicJwk.n,
        e: publicJwk.e,
    };
}

function accessTokenHash(accessToken) {
    return createHash('sha256').update(accessToken).digest('base64url');
}

export function normalizeDpopTargetUrl(url) {
    const target = new URL(url);
    target.search = '';
    target.hash = '';
    return target.toString();
}

export async function generateDpopProof(method, url, privateKey, { accessToken, nonce } = {}) {
    const payload = {
        htm: method.toUpperCase(),
        htu: normalizeDpopTargetUrl(url),
        iat: Math.floor(Date.now() / 1000),
        jti: randomUUID(),
    };

    if (accessToken) {
        payload.ath = accessTokenHash(accessToken);
    }
    if (nonce) {
        payload.nonce = nonce;
    }

    return new SignJWT(payload)
        .setProtectedHeader({
            typ: 'dpop+jwt',
            alg: 'RS256',
            jwk: publicJwkFromPrivateKey(privateKey),
        })
        .sign(privateKey);
}
