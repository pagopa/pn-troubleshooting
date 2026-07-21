import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';

export async function generateAssertionJwt(kid, issuer, audience, privateKey) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + Number(process.env.CLIENT_ASSERTION_TTL_SECONDS || 600);

    return new SignJWT({
        iss: issuer,
        sub: issuer,
        aud: audience,
        jti: randomUUID(),
        iat: issuedAt,
        exp: expiresAt,
    })
        .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
        .sign(privateKey);
}
