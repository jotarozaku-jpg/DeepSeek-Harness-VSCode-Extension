'use strict';

const path = require('node:path');
const { AcpTransport } = require('../src/acpTransport');

const repoRoot = path.resolve(__dirname, '..');
const configRoot = process.env.DSH_HOME || path.join(process.env.USERPROFILE, '.rrma-deepseek-harness');
const harnessRoot = process.env.DSH_HARNESS_ROOT || path.join(process.env.USERPROFILE, '.deepseek-harness');
const cwd = process.env.DSH_TEST_WORKSPACE || repoRoot;
const updates = [];
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
    const error = new Error(`Unexpected client request during compact smoke test: ${method}`);
    error.code = -32601;
    throw error;
  },
});
transport.on('notification', (method, params) => {
  if (method === 'session/update') updates.push(params.update);
});
transport.on('stderr', (chunk) => process.stderr.write(chunk));

async function main() {
  transport.start();
  await transport.request('initialize', {
    protocolVersion: 1,
    clientCapabilities: {},
    clientInfo: { name: 'deepseek-harness-vscode-compact-smoke', version: '0.4.0' },
  });
  const session = await transport.request('session/new', { cwd, mcpServers: [] });
  const result = await transport.request('session/prompt', {
    sessionId: session.sessionId,
    prompt: [{ type: 'text', text: '/compact' }],
  }, 0);
  const message = updates.find((item) => item.sessionUpdate === 'agent_message_chunk')?.content?.text;
  if (!message?.includes('没有可压缩')) throw new Error(`Unexpected empty-session compact result: ${message || '(none)'}`);
  process.stdout.write(`${JSON.stringify({ compactHandled: true, modelCalled: false, message, stopReason: result.stopReason }, null, 2)}\n`);
  transport.stop();
}

main().catch((error) => {
  transport.stop();
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
