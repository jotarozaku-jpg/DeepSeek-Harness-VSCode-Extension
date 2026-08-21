'use strict';

(function exposePricing(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DeepSeekHarnessPricing = api;
}(globalThis, () => {
  const MODEL_PRICING_USD_PER_MILLION = Object.freeze({
    'deepseek-v4-flash': Object.freeze({
      label: 'DeepSeek V4 Flash',
      offPeak: Object.freeze({ cacheHit: 0.007, cacheMiss: 0.22, output: 0.66 }),
      peak: Object.freeze({ cacheHit: 0.014, cacheMiss: 0.44, output: 1.32 }),
    }),
    'deepseek-v4-pro': Object.freeze({
      label: 'DeepSeek V4 Pro',
      offPeak: Object.freeze({ cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 }),
      peak: Object.freeze({ cacheHit: 0.044, cacheMiss: 1.32, output: 3.96 }),
    }),
    'deepseek-v4-flash-vision-exp': Object.freeze({
      label: 'DeepSeek V4 Flash Vision',
      offPeak: Object.freeze({ cacheHit: 0.007, cacheMiss: 0.22, output: 0.66 }),
      peak: Object.freeze({ cacheHit: 0.014, cacheMiss: 0.44, output: 1.32 }),
    }),
  });

  function pricingTierAt(value = Date.now()) {
    const date = value instanceof Date ? value : new Date(value);
    const hour = date.getUTCHours();
    return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10) ? 'peak' : 'offPeak';
  }

  function calculateUsageCost(usage, modelId, tier) {
    const rates = MODEL_PRICING_USD_PER_MILLION[modelId]?.[tier];
    if (!rates) return undefined;
    const count = (candidate) => {
      const number = Number(candidate);
      return Number.isFinite(number) && number > 0 ? number : 0;
    };
    const cache = count(usage?.cacheReadTokens) * rates.cacheHit / 1_000_000;
    const uncached = (count(usage?.uncachedInputTokens) + count(usage?.cacheWriteTokens)) * rates.cacheMiss / 1_000_000;
    const output = count(usage?.outputTokens) * rates.output / 1_000_000;
    return { cache, uncached, output, total: cache + uncached + output };
  }

  function pricingLabel(modelId, tier) {
    const model = MODEL_PRICING_USD_PER_MILLION[modelId];
    if (!model || !model[tier]) return undefined;
    return `${model.label} · ${tier === 'peak' ? '峰值时段' : '非峰值时段'}`;
  }

  return Object.freeze({ MODEL_PRICING_USD_PER_MILLION, pricingTierAt, calculateUsageCost, pricingLabel });
}));
