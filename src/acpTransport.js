'use strict';

const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');

const MAX_STDOUT_BUFFER_BYTES = 4 * 1024 * 1024;
const INHERITED_ENV_KEYS = [
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'ComSpec',
  'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'TMP',
  'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'ProgramFiles',
  'ProgramFiles(x86)', 'ProgramW6432', 'PSModulePath', 'OS',
  'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS',
  'LANG', 'LC_ALL', 'TERM', 'NO_COLOR',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
  'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS',
];

function childEnvironment(extra) {
  const inherited = {};
  for (const key of INHERITED_ENV_KEYS) {
    if (process.env[key] !== undefined) inherited[key] = process.env[key];
  }
  return { ...inherited, ...extra };
}

class AcpError extends Error {
  constructor(code, message, data) {
    super(message || `ACP error ${code}`);
    this.name = 'AcpError';
    this.code = code;
    this.data = data;
  }
}

class AcpTransport extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.child = undefined;
    this.nextId = 1;
    this.pending = new Map();
    this.stdoutBuffer = '';
    this.closed = false;
  }

  start() {
    if (this.child) return;
    const { command, args, cwd, env } = this.options;
    this.closed = false;
    this.child = spawn(command, args, {
      cwd,
      env: childEnvironment(env),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.consumeStdout(chunk));
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk) => this.emit('stderr', chunk));
    this.child.on('error', (error) => this.handleClose(error));
    this.child.on('exit', (code, signal) => {
      const detail = signal ? `signal ${signal}` : `code ${code}`;
      this.handleClose(new Error(`DeepSeek Harness exited with ${detail}.`));
    });
  }

  consumeStdout(chunk) {
    this.stdoutBuffer += chunk;
    if (Buffer.byteLength(this.stdoutBuffer, 'utf8') > MAX_STDOUT_BUFFER_BYTES) {
      this.stdoutBuffer = '';
      const error = new Error(`ACP output exceeded ${MAX_STDOUT_BUFFER_BYTES} bytes without a complete line.`);
      const child = this.child;
      this.emit('protocolError', error);
      this.handleClose(error);
      if (child) child.kill();
      return;
    }
    while (true) {
      const newline = this.stdoutBuffer.indexOf('\n');
      if (newline < 0) return;
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      try {
        this.handleMessage(JSON.parse(line));
      } catch (error) {
        this.emit('protocolError', new Error(`Invalid ACP output: ${error.message}`));
      }
    }
  }

  handleMessage(message) {
    if (Object.prototype.hasOwnProperty.call(message, 'id') && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(new AcpError(message.error.code, message.error.message, message.error.data));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.method && Object.prototype.hasOwnProperty.call(message, 'id')) {
      void this.handleServerRequest(message);
      return;
    }

    if (message.method) this.emit('notification', message.method, message.params);
  }

  async handleServerRequest(message) {
    try {
      const result = await this.options.onRequest(message.method, message.params);
      this.write({ jsonrpc: '2.0', id: message.id, result: result ?? {} });
    } catch (error) {
      this.write({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: Number.isInteger(error.code) ? error.code : -32603,
          message: error.message || 'Client request failed',
          data: error.data,
        },
      });
    }
  }

  request(method, params, timeoutMs = 30000) {
    if (!this.child || this.closed) return Promise.reject(new Error('ACP process is not running.'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = timeoutMs > 0
        ? setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`ACP request timed out: ${method}`));
        }, timeoutMs)
        : undefined;
      this.pending.set(id, { resolve, reject, timer });
      this.write({ jsonrpc: '2.0', id, method, params });
    });
  }

  notify(method, params) {
    if (!this.child || this.closed) return;
    this.write({ jsonrpc: '2.0', method, params });
  }

  write(message) {
    if (!this.child || this.child.stdin.destroyed) return;
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  handleClose(error) {
    if (this.closed) return;
    this.closed = true;
    this.child = undefined;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.emit('close', error);
  }

  stop() {
    if (!this.child) return;
    const child = this.child;
    this.child = undefined;
    this.closed = true;
    try { child.stdin.end(); } catch {}
    setTimeout(() => {
      if (child.exitCode === null) child.kill();
    }, 1200).unref();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('ACP connection stopped.'));
    }
    this.pending.clear();
  }
}

module.exports = { AcpTransport, AcpError };
