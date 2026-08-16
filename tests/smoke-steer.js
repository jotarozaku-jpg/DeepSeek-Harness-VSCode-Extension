'use strict';

const path = require('node:path');
const { AcpTransport } = require('../src/acpTransport');

const repoRoot = path.resolve(__dirname, '..');
const configRoot = process.env.DSH_HOME || path.join(process.env.USERPROFILE, '.deepseek-harness-vscode');
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
    DSH_APPROVAL_MODE: 'manual',
  },
  onRequest(method) {
    const error = new Error(`Unexpected client request during steer smoke test: ${method}`);
    error.code = -32601;
    throw error;
  },
});

transport.on('stderr', (chunk) => process.stderr.write(chunk));
transport.on('protocolError', (error) => process.stderr.write(`${error.message}\n`));

async function main() {
  transport.start();
  await transport.request('initialize', {
    protocolVersion: 1,
    clientCapabilities: {},
    clientInfo: { name: 'deepseek-harness-vscode-steer-smoke', version: '0.6.0' },
  });
  const session = await transport.request('session/new', { cwd, mcpServers: [] });
  let idleError;
  try {
    await transport.request('deepseek-harness-vscode/session/steer', { sessionId: session.sessionId, text: '继续当前任务' });
  } catch (error) {
    idleError = error;
  }
  if (idleError?.code !== -32602 || !idleError.message.includes('no prompt is in flight')) {
    throw idleError || new Error('Steer extension unexpectedly accepted an idle session.');
  }
  process.stdout.write(`${JSON.stringify({ steerRouteAvailable: true, idleGuarded: true }, null, 2)}\n`);
  transport.stop();
}

main().catch((error) => {
  transport.stop();
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
