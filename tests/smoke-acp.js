'use strict';

const path = require('node:path');
const { AcpTransport } = require('../src/acpTransport');

const repoRoot = path.resolve(__dirname, '..');
const configRoot = process.env.DSH_HOME || path.join(process.env.USERPROFILE, '.rrma-deepseek-harness');
const harnessRoot = process.env.DSH_HARNESS_ROOT || path.join(process.env.USERPROFILE, '.deepseek-harness');
const cwd = process.env.DSH_TEST_WORKSPACE || repoRoot;
const transport = new AcpTransport({
  command: 'node',
  args: [path.join(repoRoot, 'adapter', 'acp-bridge.mjs')],
  cwd,
  env: {
    DSH_HOME: configRoot,
    DSH_HARNESS_ROOT: harnessRoot,
    DSH_CORDIS_CONFIG: path.join(repoRoot, 'adapter', 'cordis.yml'),
    DSH_PERMISSION_MODE: 'workspace-write',
  },
  onRequest(method) {
    const error = new Error(`Unexpected client request during smoke test: ${method}`);
    error.code = -32601;
    throw error;
  },
});

transport.on('stderr', (chunk) => process.stderr.write(chunk));
transport.on('protocolError', (error) => process.stderr.write(`${error.message}\n`));

async function main() {
  transport.start();
  const initialized = await transport.request('initialize', {
    protocolVersion: 1,
    clientCapabilities: {},
    clientInfo: { name: 'deepseek-harness-vscode-smoke', version: '0.1.0' },
  });
  const session = await transport.request('session/new', { cwd, mcpServers: [] });
  process.stdout.write(JSON.stringify({
    protocolVersion: initialized.protocolVersion,
    agent: initialized.agentInfo?.name,
    promptCapabilities: initialized.agentCapabilities?.promptCapabilities,
    sessionCreated: Boolean(session.sessionId),
    sessionId: session.sessionId,
    cwd,
  }, null, 2));
  transport.stop();
}

main().catch((error) => {
  transport.stop();
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
