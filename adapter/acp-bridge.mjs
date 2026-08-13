#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const name = 'rrma-deepseek-harness'
process.title = name
const harnessRoot = process.env.DSH_HARNESS_ROOT
const requestedConfig = process.env.DSH_CORDIS_CONFIG
const configRoot = resolve(process.env.DSH_HOME ?? join(homedir(), '.rrma-deepseek-harness'))

if (!harnessRoot) throw new Error('DSH_HARNESS_ROOT is required.')
if (!requestedConfig) throw new Error('DSH_CORDIS_CONFIG is required.')

const configPath = resolve(requestedConfig)
const personaPath = resolve(process.env.DSH_PERSONA_PATH ?? join(configRoot, 'persona.md'))
const sessionRoot = resolve(process.env.DSH_SESSION_ROOT ?? join(homedir(), '.dsh', '.sessions'))
const runtimeConfigPath = join(configRoot, '.runtime.cordis.yml')
const appBootPath = join(harnessRoot, 'packages', 'boot', 'app-boot', 'lib', 'index.js')
const acpBinPath = join(harnessRoot, 'packages', 'examples', 'acp-demo', 'lib', 'bin.js')
const moduleAnchorPath = join(harnessRoot, 'examples', 'acp-agent', 'cordis.yml')
const pwshSandboxPath = join(harnessRoot, 'packages', 'shell', 'pwsh-sandbox', 'lib', 'index.js')
const shellEnvPath = join(harnessRoot, 'packages', 'shell', 'shell-env', 'lib', 'index.js')
const toolPwshPath = join(harnessRoot, 'packages', 'shell', 'tool-pwsh', 'lib', 'index.js')

if (!existsSync(configPath)) throw new Error(`Cordis config not found: ${configPath}`)
if (!existsSync(appBootPath)) throw new Error(`Harness app boot not found: ${appBootPath}`)
if (!existsSync(acpBinPath)) throw new Error(`Harness ACP package not found: ${acpBinPath}`)
if (!existsSync(moduleAnchorPath)) throw new Error(`Harness ACP module anchor not found: ${moduleAnchorPath}`)
if (!existsSync(pwshSandboxPath) || !existsSync(shellEnvPath) || !existsSync(toolPwshPath)) {
  throw new Error('Harness PowerShell packages are not built. Run setup.ps1 first.')
}

// These Windows-only packages are not dependencies of the stock ACP example.
// Materialize a gitignored runtime config with exact module URLs; the tracked
// template remains portable and a workspace cannot replace these paths.
mkdirSync(configRoot, { recursive: true })
const persona = existsSync(personaPath) ? readFileSync(personaPath, 'utf8') : ''
const runtimeConfig = readFileSync(configPath, 'utf8')
  .replace('__DSH_PWSH_SANDBOX_PLUGIN__', () => JSON.stringify(pathToFileURL(pwshSandboxPath).href))
  .replace('__DSH_SHELL_ENV_PLUGIN__', () => JSON.stringify(pathToFileURL(shellEnvPath).href))
  .replace('__DSH_TOOL_PWSH_PLUGIN__', () => JSON.stringify(pathToFileURL(toolPwshPath).href))
  .replace('__DSH_SESSION_ROOT__', () => JSON.stringify(sessionRoot))
  .replace('__DSH_PERSONA__', () => JSON.stringify(persona))
// POSIX mode is best-effort only on Windows. This runtime file must never
// contain credentials or other secrets; it contains local module paths and an
// optional user-owned persona loaded from the machine-local configuration.
writeFileSync(runtimeConfigPath, runtimeConfig, { encoding: 'utf8', mode: 0o600 })

const { boot, installFailLoud, loadEnv } = await import(pathToFileURL(appBootPath).href)
installFailLoud(name)
loadEnv(name)

// Bare Harness packages resolve from the installed ACP host. Relative plugin
// paths still resolve beside this extension's Cordis configuration.
const bareModuleBaseUrl = pathToFileURL(moduleAnchorPath).href
const ctx = await boot(name, runtimeConfigPath, undefined, undefined, bareModuleBaseUrl)
let exiting = false

async function disposeAndExit(code) {
  if (exiting) return
  exiting = true
  try {
    await ctx.fiber.dispose()
  } finally {
    process.exit(code)
  }
}

process.stdin.on('end', () => { void disposeAndExit(0) })
process.on('SIGTERM', () => { void disposeAndExit(0) })
process.on('SIGINT', () => { void disposeAndExit(130) })
