'use strict';

const APPROVAL_MODES = new Set(['manual', 'sandbox', 'full-access']);
const SAFE_AUTO_ALLOW_TOOLS = new Set(['read']);

function normalizeApprovalMode(value) {
  const mode = typeof value === 'string' ? value.trim() : '';
  return APPROVAL_MODES.has(mode) ? mode : 'manual';
}

function normalizeAutoAllowTools(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === 'string' && SAFE_AUTO_ALLOW_TOOLS.has(item)))];
}

function redactSecrets(value) {
  return String(value)
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, 'sk-***REDACTED***')
    .replace(/((?:api[_-]?key|authorization|access[_-]?token|secret)["'\s:=]+)[^\s,"'}]+/gi, '$1***REDACTED***');
}

class SecretRedactingBuffer {
  constructor(write, maxBufferedChars = 64 * 1024, overlapChars = 256) {
    this.write = write;
    this.maxBufferedChars = maxBufferedChars;
    this.overlapChars = overlapChars;
    this.buffer = '';
  }

  push(value) {
    this.buffer += String(value);
    while (true) {
      const newline = this.buffer.indexOf('\n');
      if (newline < 0) break;
      const line = this.buffer.slice(0, newline + 1);
      this.buffer = this.buffer.slice(newline + 1);
      this.write(redactSecrets(line));
    }
    if (this.buffer.length > this.maxBufferedChars) {
      const flushLength = this.buffer.length - this.overlapChars;
      this.write(redactSecrets(this.buffer.slice(0, flushLength)));
      this.buffer = this.buffer.slice(flushLength);
    }
  }

  flush() {
    if (!this.buffer) return;
    this.write(redactSecrets(this.buffer));
    this.buffer = '';
  }
}

module.exports = { normalizeApprovalMode, normalizeAutoAllowTools, redactSecrets, SecretRedactingBuffer };
