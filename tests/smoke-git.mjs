import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const harnessRoot = process.env.DSH_HARNESS_ROOT || join(process.env.USERPROFILE, '.deepseek-harness')
const configRoot = process.env.DSH_HOME || join(process.env.USERPROFILE, '.deepseek-harness-vscode')
const runtimeConfig = join(configRoot, '.runtime.cordis.yml')
const moduleAnchor = join(harnessRoot, 'examples', 'acp-agent', 'cordis.yml')
const bootPath = join(harnessRoot, 'packages', 'boot', 'app-boot', 'lib', 'index.js')

for (const required of [runtimeConfig, moduleAnchor, bootPath]) {
  if (!existsSync(required)) throw new Error(`Missing test prerequisite: ${required}`)
}

process.env.DSH_HOME = configRoot
process.env.DSH_HARNESS_ROOT = harnessRoot
process.env.DSH_PERMISSION_MODE = 'workspace-write'

const { boot } = await import(pathToFileURL(bootPath).href)
const ctx = await boot('rrma-deepseek-harness-git-smoke', runtimeConfig, undefined, undefined, pathToFileURL(moduleAnchor).href)
try {
  const shell = ctx.get('shell')
  if (!shell) throw new Error('PowerShell executor service was not mounted.')
  const result = await shell.run(shell.resolve({ command: 'git --version', workdir: process.cwd() }))
  const output = String(result.stdout?.text || '').trim()
  if (result.exitCode !== 0 || !/^git version /i.test(output)) {
    throw new Error(`Git was not available through Harness PowerShell: ${output || '(no output)'}`)
  }
  process.stdout.write(`${JSON.stringify({ git: output, shell: shell.pwshPath, sandbox: result.sandbox }, null, 2)}\n`)
} finally {
  await ctx.fiber.dispose()
}
