import { SignJWT } from 'jose';
import { v4 as uuidv4 } from 'uuid';

export async function generateAssertionJwt(
  kid,
  issuer,
  audience,
  privateKey
) {

  // Build payload
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresIn = issuedAt + 43200 * 60; // 30 days
  const jti = uuidv4();
  const alg = 'RS256';
  const typ = 'JWT';

  const payload = {
    iss: issuer,
    sub: issuer,
    aud: audience,
    jti: jti,
    iat: issuedAt,
    exp: expiresIn
  };


console.log(kid);
  // Sign the JWT
  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg, kid, typ })
    .sign(privateKey);

    console.log(jwt);
  return jwt;
}
