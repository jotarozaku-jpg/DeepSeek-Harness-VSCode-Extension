import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { normalizeLocale, translate } = require('../media/i18n.js')
const extension = readFileSync(new URL('../extension.js', import.meta.url), 'utf8')
const main = readFileSync(new URL('../media/main.js', import.meta.url), 'utf8')

assert.equal(normalizeLocale('en-US'), 'en')
assert.equal(normalizeLocale('ja-JP'), 'ja')
assert.equal(normalizeLocale('zh-CN'), 'zh-CN')
assert.equal(translate('设置与管理', 'en'), 'Settings & management')
assert.equal(translate('设置与管理', 'ja'), '設定と管理')
assert.equal(translate('DeepSeek V4 Pro · 峰值时段', 'en'), 'DeepSeek V4 Pro · Peak')
assert.equal(translate('DeepSeek V4 Flash Vision · 非峰值时段', 'ja'), 'DeepSeek V4 Flash Vision · オフピーク')
assert.equal(translate('共 3（工作中 1 · 空闲 1 · 已结束 1）', 'en'), '3 total (Working 1 · Idle 1 · Ended 1)')
assert.equal(translate('共 3（工作中 1 · 空闲 1 · 已结束 1）', 'ja'), '合計 3（作業中 1 · 待機 1 · 終了 1）')
assert.equal(translate('Harness error: 设置与管理 failed', 'en'), 'Harness error: 设置与管理 failed')
assert.equal(translate('ツール output includes 正在思考… as data', 'ja'), 'ツール output includes 正在思考… as data')
assert.match(extension, /id="uiLanguage"/)
for (const locale of ['zh-CN', 'en', 'ja']) assert.match(extension, new RegExp(`value="${locale}"`))
assert.match(extension + main, /setUiLanguage/)
assert.match(extension, /deepseekHarness\.uiLanguage/)
assert.match(main, /canonicalConversationTitle/)

process.stdout.write(`${JSON.stringify({ locales: ['zh-CN', 'en', 'ja'], persisted: true, liveSwitch: true }, null, 2)}\n`)
