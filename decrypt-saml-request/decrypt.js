const crypto = require("crypto");

// AES-128-CBC requires 16 random bytes for pseudo randomic string used in crypto algorithm
const IV_LENGTH = 16;

// aes-128-cbc uses a 128 bit key (16 bytes * 8)
const AES_KEY_LENGTH = 16;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
exports.toEncryptedPayload = function(
  rsaPubKey,
  plainText
) {
 
  const iv = crypto.randomBytes(IV_LENGTH);
  const aesKey = crypto.randomBytes(AES_KEY_LENGTH);
  const cipher = crypto.createCipheriv("aes-128-cbc", aesKey, iv);
  // @see https://nodejs.org/api/crypto.html#crypto_class_cipher
  const cypherText = Buffer.concat([
    cipher.update(plainText),
    cipher.final(),
  ]).toString("base64");
  const encryptedKey = crypto
    .publicEncrypt(rsaPubKey, aesKey)
    .toString("base64");
  return {
    cypherText,
    encryptedKey,
    iv: iv.toString("base64"),
  };
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
exports.toPlainText = function(
  rsaPrivateKey,
  encryptedPayload
) {
  const iv = Buffer.from(encryptedPayload.iv, "base64");
  const aesKey = crypto.privateDecrypt(
    rsaPrivateKey,
    Buffer.from(encryptedPayload.encryptedKey, "base64")
  );
  const decipher = crypto.createDecipheriv(
    "aes-128-cbc",
    Buffer.from(aesKey),
    iv
  );
  const decrypted = decipher.update(
    Buffer.from(encryptedPayload.cypherText, "base64")
  );
  const plainText = Buffer.concat([decrypted, decipher.final()]);
  return plainText.toString("utf-8");
}