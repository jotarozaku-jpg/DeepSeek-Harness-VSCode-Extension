'use strict';

const assert = require('node:assert/strict');
const { normalizeApprovalMode, normalizeAutoAllowTools, isSensitiveWorkspacePath, redactSecrets, SecretRedactingBuffer } = require('../src/security');

assert.equal(normalizeApprovalMode('manual'), 'manual');
assert.equal(normalizeApprovalMode('sandbox'), 'sandbox');
assert.equal(normalizeApprovalMode('full-access'), 'full-access');
assert.equal(normalizeApprovalMode('unexpected-value'), 'manual');
assert.equal(normalizeApprovalMode(undefined), 'manual');
assert.deepEqual(normalizeAutoAllowTools(['read', 'pwsh', 'read']), ['read']);
assert.deepEqual(normalizeAutoAllowTools('read'), []);
for (const candidate of ['.env', '.env.local', 'config/credentials.yaml', 'private/api-key.txt', 'certs/client.p12', '.deepseek/cordis.yml']) {
  assert.equal(isSensitiveWorkspacePath(candidate), true, `expected sensitive path: ${candidate}`);
}
for (const candidate of ['src/main.js', 'README.md', 'assets/icon.svg']) {
  assert.equal(isSensitiveWorkspacePath(candidate), false, `expected visible path: ${candidate}`);
}

const fakeApiKey = `sk-${'1234567890abcdefghijkl'}`;
const redacted = redactSecrets(`api_key: secret-value ${fakeApiKey} authorization=BearerToken`);
assert.equal(redacted.includes('secret-value'), false);
assert.equal(redacted.includes(fakeApiKey), false);
assert.equal(redacted.includes('BearerToken'), false);

let streamed = '';
const stream = new SecretRedactingBuffer((value) => { streamed += value; });
stream.push('prefix sk-');
stream.push(`${fakeApiKey.slice(3)} suffix\n`);
stream.flush();
assert.equal(streamed.includes(fakeApiKey), false);
assert.equal(streamed.includes('***REDACTED***'), true);

process.stdout.write(`${JSON.stringify({ approvalFailClosed: true, sensitiveSuggestionsHidden: true, logRedaction: true, chunkBoundaryRedaction: true }, null, 2)}\n`);
