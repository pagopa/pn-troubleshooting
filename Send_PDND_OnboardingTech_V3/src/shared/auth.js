import { generateDpopProof } from './dpop.js';

export async function getAccessToken(baseUrl, clientId, assertion, dpopPrivateKey, fetchImpl = fetch) {
    const url = `https://auth.${baseUrl}/token.oauth2`;
    const body = new URLSearchParams({
        client_id: clientId,
        client_assertion: assertion,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        grant_type: 'client_credentials',
    });

    let nonce;
    for (let attempt = 0; attempt < 2; attempt++) {
        const dpopProof = await generateDpopProof('POST', url, dpopPrivateKey, { nonce });
        const response = await fetchImpl(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                DPoP: dpopProof,
            },
            body,
        });

        const responseNonce = response.headers.get('dpop-nonce');
        if (!response.ok && responseNonce && responseNonce !== nonce && attempt === 0) {
            nonce = responseNonce;
            continue;
        }

        if (!response.ok) {
            throw new Error(`Token request failed: HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        if (!data.access_token) {
            throw new Error('Token request failed: response does not contain access_token');
        }
        return data.access_token;
    }

    throw new Error('Token request failed after DPoP nonce challenge');
}
