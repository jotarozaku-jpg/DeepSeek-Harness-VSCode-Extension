import { realpath } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve } from 'node:path'

/**
 * Fail-closed policy: tool calls require a fresh human decision unless a
 * machine-scoped allowlist explicitly permits a safe workspace-local read.
 * Grants never change sandbox boundaries.
 */
export const name = 'deepseek-harness-vscode-approval-all-tools'
export const inject = ['tools', 'approval']

const configuredAutoAllow = new Set(parseAutoAllow(process.env.DSH_AUTO_ALLOW_TOOLS))
const SAFE_AUTO_ALLOW = new Set(['read'])

function parseAutoAllow(value) {
  try {
    const parsed = JSON.parse(value ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []
  } catch {
    return []
  }
}

function isInside(root, target) {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function isSensitive(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/').toLowerCase()
  const leaf = basename(normalized)
  const segments = normalized.split('/')
  return segments.includes('.deepseek')
    || segments.includes('.deepseek-harness-vscode')
    || segments.includes('.dsh')
    || segments.includes('.git')
    || leaf === '.env'
    || leaf.startsWith('.env.')
    || /(?:credential|secret|token|api[_-]?key)/i.test(leaf)
    || /\.(?:pem|key|pfx|p12)$/i.test(leaf)
}

async function mayAutoAllow(exec) {
  if (!SAFE_AUTO_ALLOW.has(exec.name) || !configuredAutoAllow.has(exec.name)) return false
  const args = exec.arguments
  if (!args || typeof args !== 'object' || typeof args.file_path !== 'string') return false
  const cwd = exec.agent?.session?.header?.cwd ?? process.cwd()
  try {
    const [root, target] = await Promise.all([realpath(cwd), realpath(resolve(cwd, args.file_path))])
    const rel = relative(root, target)
    return isInside(root, target) && !isSensitive(rel)
  } catch {
    return false
  }
}

export function apply(ctx) {
  const mode = process.env.DSH_APPROVAL_MODE ?? 'manual'
  if (mode === 'sandbox' || mode === 'full-access') return
  ctx.on('tools/pre-execute', async (exec) => {
    if (await mayAutoAllow(exec)) return { kind: 'allow' }
    return {
      kind: 'ask',
      reason: `请审核工具 ${exec.name} 的本次操作。允许仅对这一次调用生效。`,
    }
  })
}
