import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const extension = readFileSync(new URL('../extension.js', import.meta.url), 'utf8')
const main = readFileSync(new URL('../media/main.js', import.meta.url), 'utf8')
const style = readFileSync(new URL('../media/style.css', import.meta.url), 'utf8')
const cordis = readFileSync(new URL('../adapter/cordis.yml', import.meta.url), 'utf8')
const questionPatch = readFileSync(new URL('../adapter/patches/acp-user-questions.patch', import.meta.url), 'utf8')
const richPatch = readFileSync(new URL('../adapter/patches/acp-rich-events.patch', import.meta.url), 'utf8')
const dashboardPatch = readFileSync(new URL('../adapter/patches/acp-dashboard.patch', import.meta.url), 'utf8')

for (const value of ['cacheHit: 0.003625', 'cacheMiss: 0.435', 'output: 0.87']) {
  assert.match(main, new RegExp(value.replace('.', '\\.')))
}
assert.doesNotMatch(main, /activePriceTier/)
assert.match(main + extension + style, /context-ring/)
assert.match(main, /tokensPerSecond/)
assert.match(richPatch, /contextPressure/)
assert.match(richPatch, /used: context\.used/)
assert.match(extension + main + style, /runtimeDashboard/)
assert.match(extension + main, /usageCompact/)
assert.match(extension + main, /usageClear/)
for (const method of ['dashboard', 'goal_action', 'subagent_interrupt']) {
  assert.match(extension + dashboardPatch, new RegExp(`deepseek-harness-vscode/session/${method}`))
}

for (const messageType of ['enqueuePrompt', 'steerQueued', 'cancelQueuedPrompt', 'queuedPromptStarted', 'queuedPromptsCancelled']) {
  assert.match(extension + main, new RegExp(`['"]${messageType}['"]`))
}
assert.match(main, /Ctrl\+Enter 立即插话/)
assert.match(extension, /queue\.length >= 20/)

for (const feature of ['sessionSearch', 'showArchived', 'forkConversation', 'setConversationArchived', 'nextForkTitle']) {
  assert.match(main + extension, new RegExp(feature))
}
assert.match(main, /ACP 暂无原生会话 Fork/)
assert.match(main, /slice\(0, 20\)/)

for (const command of ['/compact', '/clear', '/new', '/history', '/archive', '/fork', '/plan', '/code', '/settings', '/help']) {
  assert.ok(main.includes(`command: '${command}'`), `missing slash command ${command}`)
}

assert.match(extension, /deepseek-harness-vscode\/session\/request_question/)
assert.match(extension, /function sanitizeQuestions/)
assert.match(extension, /questionsById/)
assert.match(extension, /resolveDefaultConfigRoot/)
assert.match(extension, /const adapterRoot = path\.join\(this\.context\.extensionPath, 'adapter'\)/)
assert.match(extension, /const credentialPath = path\.join\(configRoot, '\.credentials\.yaml'\)/)
assert.match(main, /renderQuestionEntry/)
assert.match(main, /plan-review/)
assert.match(questionPatch, /conn\.extMethod\('deepseek-harness-vscode\/session\/request_question'/)
for (const plugin of ['@deepseek-ai/dsh-user-questions', '@deepseek-ai/dsh-tool-ask-user', '@deepseek-ai/dsh-plan-mode']) {
  assert.ok(cordis.includes(plugin), `missing interactive plugin ${plugin}`)
}

for (const selector of ['.session-filter', '.queued-bubble', '.question-card', '.context-ring', '.slash-suggestion']) {
  assert.ok(style.includes(selector), `missing UI style ${selector}`)
}

process.stdout.write(`${JSON.stringify({ pricing: true, contextActions: true, runtimeDashboard: true, queueAndSteer: true, sessionManagement: true, slashCommands: true, interactiveQuestions: true }, null, 2)}\n`)
