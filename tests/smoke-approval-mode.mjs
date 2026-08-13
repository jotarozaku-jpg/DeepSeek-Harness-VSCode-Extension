import { apply } from '../adapter/plugins/approval-all-tools.mjs'

function listenerCount(mode) {
  process.env.DSH_APPROVAL_MODE = mode
  let count = 0
  apply({ on(event, callback) {
    if (event !== 'tools/pre-execute' || typeof callback !== 'function') throw new Error('Unexpected approval hook')
    count += 1
  } })
  return count
}

const result = {
  manualHooks: listenerCount('manual'),
  sandboxHooks: listenerCount('sandbox'),
  fullAccessHooks: listenerCount('full-access'),
  unknownModeHooks: listenerCount('unexpected-value'),
}
delete process.env.DSH_APPROVAL_MODE

if (result.manualHooks !== 1 || result.sandboxHooks !== 0 || result.fullAccessHooks !== 0 || result.unknownModeHooks !== 1) {
  throw new Error(`Unexpected approval mode policy: ${JSON.stringify(result)}`)
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
