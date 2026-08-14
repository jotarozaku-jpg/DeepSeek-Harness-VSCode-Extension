import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

process.env.DSH_APPROVAL_MODE = 'manual'
process.env.DSH_AUTO_ALLOW_TOOLS = JSON.stringify(['read', 'pwsh', 'unknown'])

const pluginUrl = pathToFileURL(path.resolve('adapter/plugins/approval-all-tools.mjs'))
pluginUrl.searchParams.set('test', String(Date.now()))
const { apply } = await import(pluginUrl.href)

let approvalHook
apply({
  on(event, callback) {
    assert.equal(event, 'tools/pre-execute')
    approvalHook = callback
  },
})
assert.equal(typeof approvalHook, 'function')

const workspace = process.cwd()
const exec = (name, filePath) => ({
  name,
  arguments: filePath === undefined ? {} : { file_path: filePath },
  agent: { session: { header: { cwd: workspace } } },
})

assert.deepEqual(await approvalHook(exec('read', 'package.json')), { kind: 'allow' })
assert.equal((await approvalHook(exec('read', '.deepseek-harness-vscode/.credentials.yaml'))).kind, 'ask')
assert.equal((await approvalHook(exec('read', '.rrma-deepseek-harness/.credentials.yaml'))).kind, 'ask')
assert.equal((await approvalHook(exec('read', '../outside.txt'))).kind, 'ask')
assert.equal((await approvalHook(exec('pwsh'))).kind, 'ask')

delete process.env.DSH_APPROVAL_MODE
delete process.env.DSH_AUTO_ALLOW_TOOLS
process.stdout.write(`${JSON.stringify({ safeWorkspaceRead: true, sensitiveReadDenied: true, nonReadDenied: true }, null, 2)}\n`)
