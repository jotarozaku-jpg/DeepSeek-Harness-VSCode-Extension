import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  MODEL_PRICING_USD_PER_MILLION,
  pricingTierAt,
  calculateUsageCost,
  pricingLabel,
} = require('../media/pricing.js')

assert.equal(pricingTierAt(new Date('2026-08-21T00:59:59Z')), 'offPeak')
assert.equal(pricingTierAt(new Date('2026-08-21T01:00:00Z')), 'peak')
assert.equal(pricingTierAt(new Date('2026-08-21T04:00:00Z')), 'offPeak')
assert.equal(pricingTierAt(new Date('2026-08-21T06:00:00Z')), 'peak')
assert.equal(pricingTierAt(new Date('2026-08-21T10:00:00Z')), 'offPeak')

const oneMillionEach = { cacheReadTokens: 1_000_000, uncachedInputTokens: 1_000_000, outputTokens: 1_000_000 }
assert.equal(calculateUsageCost(oneMillionEach, 'deepseek-v4-flash', 'offPeak').total, 0.887)
assert.equal(calculateUsageCost(oneMillionEach, 'deepseek-v4-flash-vision-exp', 'peak').total, 1.774)
assert.equal(calculateUsageCost(oneMillionEach, 'deepseek-v4-pro', 'offPeak').total, 2.662)
assert.equal(calculateUsageCost(oneMillionEach, 'deepseek-v4-pro', 'peak').total, 5.324)
assert.equal(calculateUsageCost(oneMillionEach, 'unknown-model', 'peak'), undefined)
assert.match(pricingLabel('deepseek-v4-pro', 'peak'), /DeepSeek V4 Pro.*峰值/)
assert.deepEqual(Object.keys(MODEL_PRICING_USD_PER_MILLION).sort(), [
  'deepseek-v4-flash',
  'deepseek-v4-flash-vision-exp',
  'deepseek-v4-pro',
])

process.stdout.write(`${JSON.stringify({ modelAware: true, peakAware: true, unknownModelFailsClosed: true }, null, 2)}\n`)
