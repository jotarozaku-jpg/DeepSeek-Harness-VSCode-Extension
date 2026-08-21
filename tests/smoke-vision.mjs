// Credential-free checks for per-session model overrides and image admission:
// 1. initialize advertises image prompts while the attachment store is mounted
// 2. session/new honors _meta.model; a text-only model rejects image prompts
// 3. a vision-model session accepts image blocks into decode-level validation
// 4. malformed _meta.model values are rejected before agent creation
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { AcpTransport } = require('../src/acpTransport')

const repoRoot = path.resolve(import.meta.dirname, '..')
const configRoot = process.env.DSH_HOME || path.join(process.env.USERPROFILE, '.deepseek-harness-vscode')
const harnessRoot = process.env.DSH_HARNESS_ROOT || path.join(process.env.USERPROFILE, '.deepseek-harness')
const cwd = process.env.DSH_TEST_WORKSPACE || repoRoot
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
    const error = new Error(`Unexpected client request during smoke test: ${method}`)
    error.code = -32601
    throw error
  },
})
transport.on('protocolError', (error) => process.stderr.write(`${error.message}\n`))

// 1x1 transparent PNG in canonical base64.
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

async function expectReject(promise, pattern) {
  try {
    await promise
  } catch (error) {
    assert.match(String(error.message || error), pattern)
    return
  }
  assert.fail(`expected rejection matching ${pattern}`)
}

async function main() {
  transport.start()
  const initialized = await transport.request('initialize', {
    protocolVersion: 1,
    clientCapabilities: {},
    clientInfo: { name: 'deepseek-harness-vscode-smoke', version: '0.1.0' },
  })
  assert.equal(initialized.agentCapabilities?.promptCapabilities?.image, true)

  const textSession = await transport.request('session/new', { cwd, mcpServers: [], _meta: { model: 'deepseek-v4-pro' } })
  assert.ok(textSession.sessionId)
  await expectReject(
    transport.request('session/prompt', {
      sessionId: textSession.sessionId,
      prompt: [
        { type: 'image', data: TINY_PNG, mimeType: 'image/png' },
        { type: 'text', text: 'describe this image' },
      ],
    }),
    /does not declare image input|not advertised/i,
  )

  const visionSession = await transport.request('session/new', { cwd, mcpServers: [], _meta: { model: 'deepseek-v4-flash-vision-exp' } })
  assert.ok(visionSession.sessionId)
  await expectReject(
    transport.request('session/prompt', {
      sessionId: visionSession.sessionId,
      prompt: [
        { type: 'image', data: 'not-base64!!', mimeType: 'image/png' },
        { type: 'text', text: 'describe this image' },
      ],
    }),
    /canonical base64/i,
  )

  await expectReject(
    transport.request('session/new', { cwd, mcpServers: [], _meta: { model: '../escape' } }),
    /short provider model id/i,
  )

  process.stdout.write(`${JSON.stringify({
    imageAdvertised: true,
    perSessionModel: true,
    textModelRejectsImages: true,
    visionModelAdmitsImageBlocks: true,
    malformedModelRejected: true,
  }, null, 2)}\n`)
  transport.stop()
}

main().catch((error) => {
  transport.stop()
  process.stderr.write(`${error.stack || error}\n`)
  process.exitCode = 1
})
