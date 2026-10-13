'use strict';

const assert = require('node:assert/strict');

function assertCsvAttachment(message, filename, expectedContent) {
  const parts = message.split(/(?:^|\r?\n)--[^\r\n]+(?:\r?\n|$)/);
  const attachments = parts.filter((part) => /^Content-Disposition: attachment;/im.test(part));
  assert.equal(attachments.length, 2, 'attesi esattamente due allegati');
  const matches = attachments.filter((part) => part.includes(`filename=${filename}`) ||
    part.includes(`filename="${filename}"`));
  assert.equal(matches.length, 1, `allegato univoco atteso: ${filename}`);
  const separator = /\r?\n\r?\n/.exec(matches[0]);
  assert.ok(separator, 'separatore header/body MIME mancante');
  const headers = matches[0].slice(0, separator.index);
  assert.match(headers, /^Content-Transfer-Encoding: base64\s*$/im);
  const body = matches[0].slice(separator.index + separator[0].length);
  assert.equal(Buffer.from(body, 'base64').toString('utf8'), expectedContent);
}

module.exports = { assertCsvAttachment };
