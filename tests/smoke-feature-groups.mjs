import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { filterCordisPlugins, parseDisabledPluginIds } from '../adapter/runtime-feature-filter.mjs'

const source = `- id: core
  name: '@example/core'
  config:
    nested:
      - id: skills
        enabled: true

- id: skills
  name: '@example/skills'

- id: tool-skill
  name: '@example/tool-skill'

- id: tail
  name: '@example/tail'
`

assert.deepEqual(parseDisabledPluginIds('["skills","tool-skill","skills","../unsafe",42]'), ['skills', 'tool-skill'])
assert.deepEqual(parseDisabledPluginIds('not-json'), [])

const filtered = filterCordisPlugins(source, ['skills', 'tool-skill'])
assert.match(filtered, /- id: core/)
assert.match(filtered, /\s+- id: skills\n\s+enabled: true/)
assert.doesNotMatch(filtered, /^- id: skills$/m)
assert.doesNotMatch(filtered, /^- id: tool-skill$/m)
assert.match(filtered, /- id: tail/)

const realConfig = readFileSync(new URL('../adapter/cordis.yml', import.meta.url), 'utf8')
const optionalIds = [
  'skill', 'skill-filesystem', 'tool-skill',
  'subagent', 'subagent-spawn-in-process', 'subagent-fork-in-process', 'tool-subagent-control',
  'tool-subagent-list-agents', 'tool-subagent-report', 'tool-subagent', 'tool-subagent-fork',
  'workflow-worker-thread', 'tool-workflow', 'tool-ralph',
  'tool-todo', 'repeat-tool-reminder', 'compaction-basic',
]
const minimalRuntime = filterCordisPlugins(realConfig, optionalIds)
for (const id of optionalIds) assert.doesNotMatch(minimalRuntime, new RegExp(`^- id: ${id}$`, 'm'))
for (const id of ['credentials', 'llm-deepseek', 'sandbox-policy', 'approval-all-tools', 'acp-agent', 'tool-pwsh', 'token-meter', 'session-projection']) {
  assert.match(minimalRuntime, new RegExp(`^- id: ${id}$`, 'm'))
}

process.stdout.write(`${JSON.stringify({ safeIds: true, topLevelFiltering: true, nestedIdsPreserved: true, corePluginsPreserved: true }, null, 2)}\n`)
