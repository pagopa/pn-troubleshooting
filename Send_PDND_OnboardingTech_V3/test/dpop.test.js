import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import { getAccessToken } from '../src/shared/auth.js';
import {
    generateDpopPrivateKey,
    generateDpopProof,
    normalizeDpopTargetUrl,
} from '../src/shared/dpop.js';
import { PdndCoreV3Client } from '../src/shared/pdnd-core-v3.js';

function createPrivateKey() {
    return generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
}

test('each execution can generate a distinct ephemeral DPoP key', async () => {
    const [firstKey, secondKey] = await Promise.all([
        generateDpopPrivateKey(),
        generateDpopPrivateKey(),
    ]);
    const firstProof = await generateDpopProof('POST', 'https://auth.interop.pagopa.it/token.oauth2', firstKey);
    const secondProof = await generateDpopProof('POST', 'https://auth.interop.pagopa.it/token.oauth2', secondKey);

    assert.equal(decodeProtectedHeader(firstProof).jwk.kty, 'RSA');
    assert.notEqual(
        decodeProtectedHeader(firstProof).jwk.n,
        decodeProtectedHeader(secondProof).jwk.n
    );
});

test('DPoP proof binds method, URL and access token', async () => {
    const privateKey = createPrivateKey();
    const accessToken = 'header.payload.signature';
    const url = 'https://api.interop.pagopa.it/v3/agreements?states=PENDING&offset=0';
    const proof = await generateDpopProof('GET', url, privateKey, { accessToken });
    const payload = decodeJwt(proof);
    const header = decodeProtectedHeader(proof);

    assert.equal(payload.htm, 'GET');
    assert.equal(payload.htu, 'https://api.interop.pagopa.it/v3/agreements');
    assert.equal(payload.ath, createHash('sha256').update(accessToken).digest('base64url'));
    assert.equal(header.typ, 'dpop+jwt');
    assert.equal(header.alg, 'RS256');
    assert.equal(header.jwk.kty, 'RSA');
    assert.ok(payload.jti);
});

test('DPoP target normalization removes query and fragment', () => {
    assert.equal(
        normalizeDpopTargetUrl('https://api.interop.pagopa.it/v3/purposes?offset=0#fragment'),
        'https://api.interop.pagopa.it/v3/purposes'
    );
});

test('token request includes a DPoP proof without access-token hash', async () => {
    const privateKey = createPrivateKey();
    let captured;
    const fetchImpl = async (url, options) => {
        captured = { url, options };
        return new Response(JSON.stringify({ access_token: 'issued-token', token_type: 'DPoP' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    };

    const token = await getAccessToken(
        'interop.pagopa.it',
        'client-id',
        'client-assertion',
        privateKey,
        fetchImpl
    );
    const proofPayload = decodeJwt(captured.options.headers.DPoP);

    assert.equal(token, 'issued-token');
    assert.equal(captured.url, 'https://auth.interop.pagopa.it/token.oauth2');
    assert.equal(proofPayload.htm, 'POST');
    assert.equal(proofPayload.htu, captured.url);
    assert.equal(proofPayload.ath, undefined);
});

test('Core v3 read-only client sends DPoP authorization and a request proof', async () => {
    const privateKey = createPrivateKey();
    const accessToken = 'access-token';
    let captured;
    const fetchImpl = async (url, options) => {
        captured = { url: url.toString(), options };
        return new Response(JSON.stringify({
            results: [],
            pagination: { offset: 0, limit: 1, totalCount: 0 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const client = new PdndCoreV3Client({
        baseUrl: 'interop.pagopa.it',
        accessToken,
        dpopPrivateKey: privateKey,
        fetchImpl,
        minRequestIntervalMs: 0,
    });

    await client.getAllTenants(1);
    const proofPayload = decodeJwt(captured.options.headers.DPoP);

    assert.equal(captured.url, 'https://api.interop.pagopa.it/v3/tenants?offset=0&limit=1');
    assert.equal(captured.options.headers.Authorization, `DPoP ${accessToken}`);
    assert.equal(proofPayload.htm, 'GET');
    assert.equal(proofPayload.htu, 'https://api.interop.pagopa.it/v3/tenants');
    assert.equal(proofPayload.ath, createHash('sha256').update(accessToken).digest('base64url'));
});
