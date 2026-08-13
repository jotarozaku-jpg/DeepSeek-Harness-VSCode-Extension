'use strict';

const assert = require('node:assert/strict');
const { normalizeApprovalMode, normalizeAutoAllowTools, redactSecrets, SecretRedactingBuffer } = require('../src/security');

assert.equal(normalizeApprovalMode('manual'), 'manual');
assert.equal(normalizeApprovalMode('sandbox'), 'sandbox');
assert.equal(normalizeApprovalMode('full-access'), 'full-access');
assert.equal(normalizeApprovalMode('unexpected-value'), 'manual');
assert.equal(normalizeApprovalMode(undefined), 'manual');
assert.deepEqual(normalizeAutoAllowTools(['read', 'pwsh', 'read']), ['read']);
assert.deepEqual(normalizeAutoAllowTools('read'), []);

const redacted = redactSecrets('api_key: secret-value sk-1234567890abcdefghijkl authorization=BearerToken');
assert.equal(redacted.includes('secret-value'), false);
assert.equal(redacted.includes('sk-1234567890abcdefghijkl'), false);
assert.equal(redacted.includes('BearerToken'), false);

let streamed = '';
const stream = new SecretRedactingBuffer((value) => { streamed += value; });
stream.push('prefix sk-');
stream.push('1234567890abcdefghijkl suffix\n');
stream.flush();
assert.equal(streamed.includes('sk-1234567890abcdefghijkl'), false);
assert.equal(streamed.includes('***REDACTED***'), true);

process.stdout.write(`${JSON.stringify({ approvalFailClosed: true, logRedaction: true, chunkBoundaryRedaction: true }, null, 2)}\n`);
