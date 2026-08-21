/* global acquireVsCodeApi, DSH_I18N */
'use strict';

const vscode = acquireVsCodeApi();
const i18n = DSH_I18N;
let uiLanguageValue = 'zh-CN';
const conversation = document.getElementById('conversation');
const welcome = document.getElementById('welcome');
const input = document.getElementById('input');
const send = document.getElementById('send');
const cancel = document.getElementById('cancel');
const compact = document.getElementById('compact');
const newSession = document.getElementById('newSession');
const settings = document.getElementById('settings');
const status = document.getElementById('status');
const modelLabel = document.getElementById('modelLabel');
const workspaceBar = document.getElementById('workspaceBar');
const sessionControls = document.getElementById('sessionControls');
const fileSuggestions = document.getElementById('fileSuggestions');
const composerHint = document.getElementById('composerHint');
const usageButton = document.getElementById('usageButton');
const usagePanel = document.getElementById('usagePanel');
const usageInput = document.getElementById('usageInput');
const usageOutput = document.getElementById('usageOutput');
const usageCacheRate = document.getElementById('usageCacheRate');
const usageCacheRead = document.getElementById('usageCacheRead');
const usageUncached = document.getElementById('usageUncached');
const usageCost = document.getElementById('usageCost');
const usageCostBreakdown = document.getElementById('usageCostBreakdown');
const usageContext = document.getElementById('usageContext');
const usageTtft = document.getElementById('usageTtft');
const usageThroughput = document.getElementById('usageThroughput');
const usagePriceTier = document.getElementById('usagePriceTier');
const usageCompact = document.getElementById('usageCompact');
const usageClear = document.getElementById('usageClear');
const contextMeter = document.getElementById('contextMeter');
const contextRing = document.getElementById('contextRing');
const contextLabel = document.getElementById('contextLabel');
const history = document.getElementById('history');
const historyDot = document.getElementById('historyDot');
const closeHistory = document.getElementById('closeHistory');
const clearConversation = document.getElementById('clearConversation');
const clearHistory = document.getElementById('clearHistory');
const sessionPanel = document.getElementById('sessionPanel');
const sessionList = document.getElementById('sessionList');
const sessionSearch = document.getElementById('sessionSearch');
const showArchived = document.getElementById('showArchived');
const conversationTitle = document.getElementById('conversationTitle');
const approvalMode = document.getElementById('approvalMode');
const composerApprovalMode = document.getElementById('composerApprovalMode');
const composerModel = document.getElementById('composerModel');
const attachImage = document.getElementById('attachImage');
const imageFileInput = document.getElementById('imageFileInput');
const imageChips = document.getElementById('imageChips');
const autoAllowRead = document.getElementById('autoAllowRead');
const thoughtDisplay = document.getElementById('thoughtDisplay');
const uiLanguage = document.getElementById('uiLanguage');
const settingsOverlay = document.getElementById('settingsOverlay');
const closeSettings = document.getElementById('closeSettings');
const openAdvancedSettings = document.getElementById('openAdvancedSettings');
const openLogs = document.getElementById('openLogs');
const copyDiagnostics = document.getElementById('copyDiagnostics');
const restartRuntime = document.getElementById('restartRuntime');
const refreshDiagnostics = document.getElementById('refreshDiagnostics');
const diagnosticList = document.getElementById('diagnosticList');
const managementStatus = document.getElementById('managementStatus');
const managementVersion = document.getElementById('managementVersion');
const managementPreset = document.getElementById('managementPreset');
const managementReasoning = document.getElementById('managementReasoning');
const managementModel = document.getElementById('managementModel');
const managementCredentials = document.getElementById('managementCredentials');
const managementCwd = document.getElementById('managementCwd');
const managementHarnessRoot = document.getElementById('managementHarnessRoot');
const managementConfigRoot = document.getElementById('managementConfigRoot');
const managementNodePath = document.getElementById('managementNodePath');
const managementSessionRoot = document.getElementById('managementSessionRoot');
const featureGroupList = document.getElementById('featureGroupList');
const pluginSummary = document.getElementById('pluginSummary');
const pluginInventory = document.getElementById('pluginInventory');
const localPluginFiles = document.getElementById('localPluginFiles');
const openCordisConfig = document.getElementById('openCordisConfig');
const openPluginDirectory = document.getElementById('openPluginDirectory');
const runtimeDashboard = document.getElementById('runtimeDashboard');
const goalBar = document.getElementById('goalBar');
const goalObjective = document.getElementById('goalObjective');
const goalStatus = document.getElementById('goalStatus');
const goalToggle = document.getElementById('goalToggle');
const goalClear = document.getElementById('goalClear');
const subagentPanel = document.getElementById('subagentPanel');
const subagentSummary = document.getElementById('subagentSummary');
const subagentList = document.getElementById('subagentList');
const chromeLocalizer = i18n.createDomLocalizer(document, () => uiLanguageValue);

function tr(source) {
  return i18n.translate(String(source ?? ''), uiLanguageValue);
}

function refreshChrome() {
  chromeLocalizer.refresh([
    document.querySelector('.topbar'), sessionPanel, settingsOverlay,
    document.querySelector('.context-header'), welcome, document.querySelector('.composer-shell'),
  ]);
}

function applyUiLanguage(value, rerender = true) {
  uiLanguageValue = i18n.normalizeLocale(value);
  document.documentElement.lang = uiLanguageValue;
  uiLanguage.value = uiLanguageValue;
  refreshChrome();
  if (rerender) render();
}

function canonicalConversationTitle(value) {
  const text = String(value || '').trim();
  return ['zh-CN', 'en', 'ja'].some((locale) => text === i18n.translate('新对话', locale)) ? '新对话' : text;
}

const saved = vscode.getState() || {};
let conversations = Array.isArray(saved.conversations) ? saved.conversations : [];
let activeConversationId = saved.activeConversationId;
let runtimeId = saved.runtimeId;
let activeTurn = false;
let compactActive = false;
let followOutput = true;
let userPausedFollow = false;
let lastScrollY = window.scrollY;
let scrollInteractionVersion = 0;
let resizeFollowFrame;
let dashboardTimer;
let saveTimer;
let renderTimer;
let renderPendingForceScroll = false;
let lastRenderAt = 0;
let configured = false;
let renderEpoch = 0;
let programmaticScroll = false;
let fileSuggestTimer;
let fileSuggestRequestId;
let fileMentionRange;
let slashCommandRange;
let managementConfiguration = {};
let managedFeatureGroups = [];
let availableModels = [];
let defaultModelId = 'deepseek-v4-pro';
let imageLimits = { maxImages: 8, maxImageBytes: 16 * 1024 * 1024, maxMessageImageBytes: 20 * 1024 * 1024 };
const draftImagesByConversation = new Map();
const IMAGE_MIME_SET = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const renderedEntryLimits = new Map();
const MAX_STORED_CONVERSATIONS = 50;
const MAX_STORED_ENTRIES = 500;
const MAX_STORED_ENTRY_CHARS = 128 * 1024;
const MAX_STORED_STATE_CHARS = 8 * 1024 * 1024;
const MAX_RUNTIME_ENTRIES = 600;
const RUNTIME_ENTRY_TRIM_TARGET = 500;
const MAX_RUNTIME_TOOL_FIELD_CHARS = 64 * 1024;
const MAX_STREAM_ENTRY_CHARS = 256 * 1024;
const STREAM_RENDER_INTERVAL_MS = 50;
const STATE_SAVE_INTERVAL_MS = 500;
const RENDER_ENTRY_PAGE_SIZE = 200;
const V4_PRO_USD_PER_MILLION = Object.freeze({ cacheHit: 0.003625, cacheMiss: 0.435, output: 0.87 });
const SLASH_COMMANDS = Object.freeze([
  { command: '/compact', detail: '压缩较早的 Harness 上下文（可能产生费用）' },
  { command: '/clear', detail: '清空当前对话并新建 Harness 上下文' },
  { command: '/new', detail: '新建空白对话' },
  { command: '/history', detail: '打开会话搜索与归档' },
  { command: '/archive', detail: '归档当前对话' },
  { command: '/fork', detail: '复制可见记录并开启新 Harness 上下文' },
  { command: '/plan', detail: '切换到 Harness Plan 模式（若可用）' },
  { command: '/code', detail: '切换回 Harness Code 模式（若可用）' },
  { command: '/settings', detail: '打开扩展设置与管理' },
  { command: '/help', detail: '显示斜杠命令帮助' },
]);

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function tokenCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(Math.floor(number), Number.MAX_SAFE_INTEGER) : 0;
}

function normalizeUsage(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    inputTokens: tokenCount(source.inputTokens),
    uncachedInputTokens: tokenCount(source.uncachedInputTokens),
    outputTokens: tokenCount(source.outputTokens),
    cacheReadTokens: tokenCount(source.cacheReadTokens),
    cacheWriteTokens: tokenCount(source.cacheWriteTokens),
  };
}

function usageHasTokens(value) {
  const usage = normalizeUsage(value);
  return Object.values(usage).some((count) => count > 0);
}

function normalizePerformance(value) {
  const metric = (candidate) => {
    const number = Number(candidate);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  };
  return {
    ttftMs: metric(value?.ttftMs),
    tokensPerSecond: metric(value?.tokensPerSecond),
    durationMs: metric(value?.durationMs),
  };
}

function normalizeGoal(value) {
  if (!value || typeof value !== 'object') return null;
  const phase = ['active', 'paused', 'blocked', 'complete'].includes(value.phase) ? value.phase : 'active';
  return {
    id: String(value.id || ''),
    revision: tokenCount(value.revision),
    objective: String(value.objective || '').slice(0, 4000),
    phase,
    roundsStarted: tokenCount(value.roundsStarted),
    maxGoalRounds: tokenCount(value.maxGoalRounds),
    blockedReason: typeof value.blockedReason?.message === 'string' ? value.blockedReason.message.slice(0, 1000) : '',
  };
}

function normalizeSubagents(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || !entry.id) return [];
    return [{
      id: String(entry.id).slice(0, 256),
      parentId: String(entry.parentId || '').slice(0, 256),
      label: String(entry.label || entry.id).slice(0, 240),
      mode: entry.mode === 'continuable' ? 'continuable' : 'one-shot',
      activity: entry.activity === 'running' ? 'running' : 'inactive',
      workStatus: ['working', 'idle', 'ended'].includes(entry.workStatus)
        ? entry.workStatus
        : entry.activity === 'running' ? 'idle' : 'ended',
      depth: Math.min(16, tokenCount(entry.depth)),
    }];
  });
}

function normalizeConversation(item) {
  let droppedQueued = false;
  const entries = (Array.isArray(item?.entries) ? item.entries : []).flatMap((entry) => {
    if (entry?.type === 'queued') {
      droppedQueued = true;
      return [];
    }
    if (entry?.type === 'permission' || entry?.type === 'question') return [{ ...entry, resolved: true }];
    if (entry?.type === 'assistant' || entry?.type === 'thought') return [{ ...entry, streaming: false }];
    return [entry];
  });
  if (droppedQueued) entries.push({ type: 'notice', message: '上次关闭前的排队消息没有自动执行，请按需要重新发送。' });
  const hasStoredTiers = item?.usageByTier && typeof item.usageByTier === 'object';
  const usage = normalizeUsage(item?.usage);
  return {
    id: String(item?.id || uid()),
    title: String(item?.title || '新对话'),
    entries,
    unread: Boolean(item?.unread),
    archived: Boolean(item?.archived),
    updatedAt: Number(item?.updatedAt || Date.now()),
    sessionId: item?.sessionId,
    runtimeId: item?.runtimeId,
    activeTurn: Boolean(item?.activeTurn),
    cancelState: 'idle',
    modes: item?.modes,
    configOptions: Array.isArray(item?.configOptions) ? item.configOptions : [],
    usage,
    usageByTier: {
      peak: normalizeUsage(item?.usageByTier?.peak),
      offPeak: normalizeUsage(item?.usageByTier?.offPeak),
    },
    pricingIncomplete: Boolean(item?.pricingIncomplete) || (!hasStoredTiers && usageHasTokens(usage)),
    contextUsage: {
      used: tokenCount(item?.contextUsage?.used),
      size: tokenCount(item?.contextUsage?.size),
    },
    performance: normalizePerformance(item?.performance),
    goal: normalizeGoal(item?.goal),
    subagents: normalizeSubagents(item?.subagents),
    turnTelemetry: undefined,
    forkedFrom: item?.forkedFrom,
    model: typeof item?.model === 'string' ? item.model : undefined,
  };
}

function conversationModelId(item) {
  return item?.model || defaultModelId;
}

function modelInfo(modelId) {
  return availableModels.find((candidate) => candidate.id === modelId);
}

function conversationSupportsVision(item) {
  return modelInfo(conversationModelId(item))?.vision === true;
}

function currentDraftImages() {
  const id = current().id;
  if (!draftImagesByConversation.has(id)) draftImagesByConversation.set(id, []);
  return draftImagesByConversation.get(id);
}

function populateModelSelect() {
  composerModel.replaceChildren();
  for (const model of availableModels) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.vision ? `${model.label} 🖼` : model.label;
    option.setAttribute('data-i18n-skip', '');
    composerModel.appendChild(option);
  }
}

function ensureConversation(id = activeConversationId) {
  let item = conversations.find((candidate) => candidate.id === id);
  if (!item) {
    item = normalizeConversation({ id: id || uid(), title: '新对话' });
    conversations.push(item);
  }
  if (!activeConversationId) activeConversationId = item.id;
  return item;
}

conversations = conversations.map((item) => normalizeConversation({ ...item, activeTurn: false }));
ensureConversation();

function current() {
  return ensureConversation(activeConversationId);
}

function buildPersistedState() {
  const storedConversations = [...conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_STORED_CONVERSATIONS)
    .map((item) => {
      const { turnTelemetry: _turnTelemetry, cancelState: _cancelState, ...durable } = item;
      return {
      ...durable,
      entries: item.entries.slice(-MAX_STORED_ENTRIES).filter((entry) => {
        try { return JSON.stringify(entry).length <= MAX_STORED_ENTRY_CHARS; } catch { return false; }
      }),
    };
    });
  const state = { conversations: storedConversations, activeConversationId, runtimeId, savedAt: configured ? Date.now() : tokenCount(saved.savedAt) };
  while (JSON.stringify(state).length > MAX_STORED_STATE_CHARS) {
    const target = [...storedConversations].reverse().find((item) => item.entries.length > 0);
    if (!target) break;
    target.entries.shift();
  }
  return state;
}

function flushPersist() {
  saveTimer = undefined;
  const state = buildPersistedState();
  vscode.setState(state);
  vscode.postMessage({ type: 'saveState', state });
}

function persist(immediate = false) {
  if (immediate) {
    clearTimeout(saveTimer);
    flushPersist();
    return;
  }
  // 流式输出期间最多每 500ms 序列化一次完整会话，避免每个 token 都复制数 MB 状态。
  if (!saveTimer) saveTimer = setTimeout(flushPersist, STATE_SAVE_INTERVAL_MS);
}

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function setManagementText(element, value, fallback = '—') {
  const text = String(value || fallback);
  element.textContent = text;
  element.title = text;
}

function setApprovalModeControls(value) {
  const normalized = ['manual', 'sandbox', 'full-access'].includes(value) ? value : 'manual';
  approvalMode.value = normalized;
  composerApprovalMode.value = normalized;
  composerApprovalMode.title = ({
    manual: '全部工具调用都需要手动审核',
    sandbox: '沙盒范围内自动执行，越界时询问',
    'full-access': '全部放行（超危险！仅限完全可信的工作区）',
  })[normalized];
}

function updateManagementConfiguration(value = managementConfiguration) {
  managementConfiguration = { ...managementConfiguration, ...(value || {}) };
  if (Array.isArray(managementConfiguration.featureGroups)) managedFeatureGroups = managementConfiguration.featureGroups;
  setManagementText(managementVersion, managementConfiguration.extensionVersion);
  setManagementText(managementPreset, managementConfiguration.preset, 'Current Cordis configuration');
  setManagementText(managementReasoning, managementConfiguration.reasoningEffort, 'max');
  setManagementText(managementModel, managementConfiguration.model, 'DeepSeek V4 Pro');
  setManagementText(managementCwd, managementConfiguration.cwd);
  setManagementText(managementHarnessRoot, managementConfiguration.harnessRoot);
  setManagementText(managementConfigRoot, managementConfiguration.configRoot);
  setManagementText(managementNodePath, managementConfiguration.nodePath, 'node');
  setManagementText(managementSessionRoot, managementConfiguration.sessionRoot);
  managementCredentials.textContent = managementConfiguration.credentialsConfigured ? '已配置 ✓' : '未配置';
  managementCredentials.classList.toggle('management-ok', Boolean(managementConfiguration.credentialsConfigured));
  managementCredentials.classList.toggle('management-bad', !managementConfiguration.credentialsConfigured);
  renderFeatureGroups();
}

function renderFeatureGroups() {
  featureGroupList.replaceChildren();
  const busy = current().activeTurn || compactActive;
  for (const group of managedFeatureGroups) {
    const row = make('label', 'feature-group-row');
    const copy = make('span', 'feature-group-copy');
    copy.append(make('strong', '', group.label || group.id), make('small', '', group.description || ''));
    const meta = make('span', 'feature-group-meta', `${group.pluginCount || 0} 个组件`);
    const checkbox = make('input', 'management-checkbox');
    checkbox.type = 'checkbox';
    checkbox.checked = group.enabled !== false;
    checkbox.disabled = busy;
    checkbox.addEventListener('change', () => {
      for (const inputElement of featureGroupList.querySelectorAll('input')) inputElement.disabled = true;
      vscode.postMessage({ type: 'setFeatureGroup', groupId: group.id, enabled: checkbox.checked });
    });
    row.append(copy, meta, checkbox);
    featureGroupList.appendChild(row);
  }
  if (!managedFeatureGroups.length) featureGroupList.appendChild(make('span', 'settings-note', '尚未收到可管理的功能组。'));
}

function renderPluginInventory(data) {
  pluginInventory.replaceChildren();
  const plugins = Array.isArray(data.pluginInventory) ? data.pluginInventory : [];
  const sourceLabels = { official: '官方', local: '本地', runtime: '运行时' };
  for (const plugin of plugins) {
    const row = make('div', `plugin-inventory-row${plugin.enabled === false ? ' disabled' : ''}`);
    const name = make('span', 'plugin-inventory-name');
    name.append(make('strong', '', plugin.id), make('small', '', plugin.name || '未声明名称'));
    const state = plugin.enabled === false ? '已关闭' : plugin.locked ? '核心锁定' : '已启用';
    row.append(name, make('span', 'plugin-source', sourceLabels[plugin.source] || plugin.source || '未知'), make('span', 'plugin-state', state));
    pluginInventory.appendChild(row);
  }
  const localFiles = Array.isArray(data.localPluginFiles) ? data.localPluginFiles : [];
  localPluginFiles.textContent = localFiles.length ? `本地插件文件：${localFiles.join('、')}` : '没有发现额外的本地插件文件。';
  const enabledCount = plugins.filter((item) => item.enabled !== false).length;
  const lockedCount = plugins.filter((item) => item.locked).length;
  pluginSummary.textContent = `${enabledCount}/${plugins.length} 已配置启用 · ${lockedCount} 个核心组件`;
}

function renderDiagnostics(data) {
  updateManagementConfiguration(data.configuration);
  if (data.configuration?.approvalMode) setApprovalModeControls(data.configuration.approvalMode);
  if (data.configuration?.thoughtDisplay) thoughtDisplay.value = data.configuration.thoughtDisplay;
  if (Array.isArray(data.configuration?.autoAllowTools)) autoAllowRead.checked = data.configuration.autoAllowTools.includes('read');
  diagnosticList.replaceChildren();
  for (const check of Array.isArray(data.checks) ? data.checks : []) {
    const row = make('div', `diagnostic-row ${check.ok ? 'ok' : 'bad'}`);
    const label = make('span', '', `${check.ok ? '✓' : '×'} ${check.label}`);
    const detail = make('code', '', check.detail || '—');
    detail.title = check.detail || '';
    row.append(label, detail);
    diagnosticList.appendChild(row);
  }
  if (!diagnosticList.children.length) diagnosticList.appendChild(make('span', 'settings-note', '没有收到诊断结果。'));
  managementStatus.textContent = data.connected ? `已连接 · ${data.activeTurns || 0} 个任务运行中` : '未连接';
  managementStatus.classList.toggle('management-ok', Boolean(data.connected));
  managementStatus.classList.toggle('management-bad', !data.connected);
  renderPluginInventory(data);
  refreshChrome();
}

function openSettingsDialog() {
  setUsagePanelOpen(false);
  settingsOverlay.hidden = false;
  settings.setAttribute('aria-expanded', 'true');
  vscode.postMessage({ type: 'requestDiagnostics' });
  requestAnimationFrame(() => closeSettings.focus());
}

function closeSettingsDialog() {
  settingsOverlay.hidden = true;
  settings.setAttribute('aria-expanded', 'false');
}

function setUsagePanelOpen(open) {
  usagePanel.hidden = !open;
  usageButton.setAttribute('aria-expanded', String(open));
  contextMeter.setAttribute('aria-expanded', String(open));
}

function requestCompact() {
  closeSettingsDialog();
  setUsagePanelOpen(false);
  vscode.postMessage({ type: 'compact', conversationId: activeConversationId });
}

function compactTokens(value) {
  const number = tokenCount(value);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(number >= 100_000 ? 0 : 1)}K`;
  return number.toLocaleString();
}

function calculateUsageCost(usage) {
  const value = normalizeUsage(usage);
  const rate = V4_PRO_USD_PER_MILLION;
  const cache = value.cacheReadTokens * rate.cacheHit / 1_000_000;
  const uncached = (value.uncachedInputTokens + value.cacheWriteTokens) * rate.cacheMiss / 1_000_000;
  const output = value.outputTokens * rate.output / 1_000_000;
  return { cache, uncached, output, total: cache + uncached + output };
}

function formatDuration(milliseconds) {
  if (!milliseconds) return '—';
  return milliseconds < 1000 ? `${Math.round(milliseconds)} ms` : `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 2 : 1)} s`;
}

function renderUsage(item) {
  const usage = normalizeUsage(item.usage);
  item.usage = usage;
  const rate = usage.inputTokens > 0 ? usage.cacheReadTokens / usage.inputTokens : undefined;
  const rateText = rate === undefined ? '—' : `${(rate * 100).toFixed(rate >= 0.1 ? 1 : 2)}%`;
  usageButton.textContent = `In ${compactTokens(usage.inputTokens)} · Out ${compactTokens(usage.outputTokens)} · Cache ${rateText}`;
  usageButton.title = `当前对话：Input ${usage.inputTokens.toLocaleString()}，Output ${usage.outputTokens.toLocaleString()}，Cache hit rate ${rateText}`;
  usageInput.textContent = usage.inputTokens.toLocaleString();
  usageOutput.textContent = usage.outputTokens.toLocaleString();
  usageCacheRate.textContent = rateText;
  usageCacheRead.textContent = usage.cacheReadTokens.toLocaleString();
  usageUncached.textContent = usage.uncachedInputTokens.toLocaleString();
  const context = item.contextUsage || { used: 0, size: 0 };
  const contextRate = context.size > 0 ? Math.min(1, context.used / context.size) : 0;
  const contextText = context.size > 0 ? `${compactTokens(context.used)} / ${compactTokens(context.size)} (${(contextRate * 100).toFixed(1)}%)` : '—';
  usageContext.textContent = contextText;
  contextLabel.textContent = context.size > 0 ? `${Math.round(contextRate * 100)}%` : 'Context —';
  contextRing.style.setProperty('--context-progress', `${contextRate * 360}deg`);
  contextMeter.title = context.size > 0 ? `上下文占用 ${contextText}` : '上下文占用尚未知';
  const performance = normalizePerformance(item.performance);
  usageTtft.textContent = formatDuration(performance.ttftMs);
  usageThroughput.textContent = performance.tokensPerSecond > 0 ? `${performance.tokensPerSecond.toFixed(1)} tok/s` : '—';
  usagePriceTier.textContent = 'DeepSeek V4 Pro 官方美元单价';
  const cost = calculateUsageCost(usage);
  usageCost.textContent = `$${cost.total.toFixed(6)}`;
  usageCostBreakdown.textContent = `缓存 $${cost.cache.toFixed(6)} ＋ 未缓存输入 $${cost.uncached.toFixed(6)} ＋ 输出 $${cost.output.toFixed(6)}`;
}

function addUsage(item, value) {
  const delta = normalizeUsage(value);
  const usage = normalizeUsage(item.usage);
  for (const key of Object.keys(usage)) usage[key] = tokenCount(usage[key] + delta[key]);
  item.usage = usage;
  if (item.turnTelemetry) item.turnTelemetry.outputTokens = tokenCount(item.turnTelemetry.outputTokens + delta.outputTokens);
}

function startTurnTelemetry(item) {
  item.turnTelemetry = { startedAt: Date.now(), firstActivityAt: 0, outputTokens: 0 };
}

function markTurnActivity(item) {
  if (item.turnTelemetry && !item.turnTelemetry.firstActivityAt) item.turnTelemetry.firstActivityAt = Date.now();
}

function finishTurnTelemetry(item) {
  const telemetry = item.turnTelemetry;
  if (!telemetry) return;
  const endedAt = Date.now();
  const firstAt = telemetry.firstActivityAt || endedAt;
  const generationMs = Math.max(0, endedAt - firstAt);
  item.performance = {
    ttftMs: Math.max(0, firstAt - telemetry.startedAt),
    tokensPerSecond: telemetry.outputTokens > 0 && generationMs > 0 ? telemetry.outputTokens / (generationMs / 1000) : 0,
    durationMs: Math.max(0, endedAt - telemetry.startedAt),
  };
  item.turnTelemetry = undefined;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="#" data-external-url="$2" title="$2">$1 <span class="external-mark">↗</span></a>');
}

function renderMarkdown(target, value) {
  const source = String(value || '');
  const segments = source.split(/```/);
  for (let i = 0; i < segments.length; i += 1) {
    if (i % 2 === 1) {
      const pre = make('pre', 'code-block', segments[i].replace(/^[\w.+-]+\n/, '').replace(/\n$/, ''));
      target.appendChild(pre);
      continue;
    }
    const lines = segments[i].split('\n');
    let paragraph = [];
    const flush = () => {
      if (!paragraph.length) return;
      const p = make('p', 'markdown-line');
      p.innerHTML = inlineMarkdown(paragraph.join('\n')).replaceAll('\n', '<br>');
      target.appendChild(p);
      paragraph = [];
    };
    for (const line of lines) {
      if (/^\s*[-*]\s+/.test(line)) {
        flush();
        const item = make('div', 'bullet-line');
        item.innerHTML = `<span>•</span><div>${inlineMarkdown(line.replace(/^\s*[-*]\s+/, ''))}</div>`;
        target.appendChild(item);
      } else if (line.trim() === '') flush();
      else paragraph.push(line);
    }
    flush();
  }
}

function printable(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function textBlocks(content) {
  if (!Array.isArray(content)) return '';
  return content.map((item) => {
    if (item?.type === 'content' && item.content?.type === 'text') return item.content.text;
    if (item?.type === 'text') return item.text;
    return '';
  }).filter(Boolean).join('\n');
}

function diffBlocks(content) {
  if (!Array.isArray(content)) return [];
  return content.filter((item) => item?.type === 'diff');
}

function locationsText(locations) {
  if (!Array.isArray(locations)) return '';
  return locations.map((location) => {
    const line = location?.line ?? location?.range?.start?.line;
    return `${location?.path || location?.uri || tr('未知位置')}${line === undefined ? '' : `:${Number(line) + (location?.range ? 1 : 0)}`}`;
  }).join('\n');
}

function addDetail(card, label, value, className = 'tool-output', open = false) {
  const text = printable(value);
  if (!text) return;
  const details = make('details', 'tool-details');
  details.open = open;
  details.append(make('summary', '', label), make('pre', className, text));
  card.appendChild(details);
}

function addToolInformation(card, tool, permission = false) {
  addDetail(card, tr('调用内容'), tool?.rawInput, permission ? 'permission-input' : 'tool-output', permission);
  addDetail(card, tr('涉及位置'), locationsText(tool?.locations));
  for (const diff of diffBlocks(tool?.content)) {
    const path = diff.path || diff.filePath || tr('文件变更');
    const details = make('details', 'tool-details');
    const summary = make('summary', '', `${tr('文件变更')} · ${path}`);
    const diffButton = make('button', 'open-diff-button', tr('在 VS Code 打开差分'));
    diffButton.type = 'button';
    diffButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      vscode.postMessage({ type: 'openDiff', path, oldText: diff.oldText || '', newText: diff.newText || '' });
    });
    details.append(summary, diffButton, make('pre', 'tool-output diff-output', `--- ${tr('修改前')}\n${diff.oldText || ''}\n+++ ${tr('修改后')}\n${diff.newText || ''}`));
    card.appendChild(details);
  }
  addDetail(card, tr('工具输出'), textBlocks(tool?.content));
  addDetail(card, tr('原始结果'), tool?.rawOutput);
}

function renderQuestionEntry(entry) {
  const questions = Array.isArray(entry.questions) ? entry.questions.slice(0, 3) : [];
  const isPlanReview = questions.some((question) => question?.intent?.kind === 'plan-review');
  const card = make('section', `question-card${isPlanReview ? ' plan-review-card' : ''}${entry.resolved ? ' resolved' : ''}`);
  card.appendChild(make('div', 'question-kicker', tr(entry.resolved ? '已回答' : isPlanReview ? 'Plan 审核' : 'Harness 需要用户回答')));
  const form = make('div', 'question-form');
  const fields = [];
  questions.forEach((question, questionIndex) => {
    const field = make('fieldset', 'question-field');
    const legend = make('legend');
    legend.append(make('strong', '', question.header || tr(`问题 ${questionIndex + 1}`)), make('span', '', question.question || tr('请选择')));
    field.appendChild(legend);
    if (question.detail) {
      const detail = make('div', 'question-detail');
      renderMarkdown(detail, question.detail);
      field.appendChild(detail);
    }
    const optionInputs = [];
    for (const option of Array.isArray(question.options) ? question.options.slice(0, 20) : []) {
      const label = make('label', 'question-option');
      const control = make('input');
      control.type = question.multiSelect ? 'checkbox' : 'radio';
      control.name = `question-${entry.requestId}-${questionIndex}`;
      control.value = String(option.label || '');
      control.disabled = Boolean(entry.resolved);
      const copy = make('span');
      copy.append(make('strong', '', option.label || tr('选项')));
      if (option.description) copy.appendChild(make('small', '', option.description));
      label.append(control, copy);
      field.appendChild(label);
      optionInputs.push(control);
    }
    const custom = make('textarea', 'question-custom');
    custom.rows = 2;
    custom.placeholder = tr(question.multiSelect ? '补充回答（可选）' : '自定义回答（填写后将覆盖单选）');
    custom.disabled = Boolean(entry.resolved);
    field.appendChild(custom);
    fields.push({ question, optionInputs, custom });
    form.appendChild(field);
  });
  if (!entry.resolved) {
    const submitAnswer = make('button', 'question-submit', tr(isPlanReview ? '提交审核结果' : '提交回答'));
    submitAnswer.type = 'button';
    submitAnswer.addEventListener('click', () => {
      const answers = fields.map(({ question, optionInputs, custom }) => ({
        id: String(question.id || ''),
        selected: custom.value.trim() && !question.multiSelect ? [] : optionInputs.filter((control) => control.checked).map((control) => control.value),
        ...(custom.value.trim() ? { custom: custom.value.trim() } : {}),
      }));
      vscode.postMessage({ type: 'questionResponse', requestId: entry.requestId, answers });
      entry.resolved = true;
      entry.answers = answers;
      render();
    });
    form.appendChild(submitAnswer);
  } else {
    const summary = (entry.answers || []).map((answer) => answer.custom || answer.selected?.join('、')).filter(Boolean).join('；');
    form.appendChild(make('div', 'question-answer-summary', summary || tr('已跳过')));
  }
  card.appendChild(form);
  return card;
}

function renderEntry(entry) {
  if (entry.type === 'user') {
    const row = make('article', 'message user-message');
    const bubble = make('div', `user-bubble${entry.steering ? ' steering-bubble' : ''}`, entry.text);
    if (Array.isArray(entry.images) && entry.images.length) {
      const chips = make('div', 'user-image-chips');
      for (const image of entry.images) {
        const size = image.bytes ? ` · ${Math.max(1, Math.round(image.bytes / 1024))}KB` : '';
        chips.appendChild(make('span', 'user-image-chip', `🖼 ${image.name}${size}`));
      }
      bubble.appendChild(chips);
    }
    row.appendChild(bubble);
    return row;
  }
  if (entry.type === 'assistant') {
    const row = make('article', 'message assistant-message');
    row.appendChild(make('div', 'assistant-avatar', 'DS'));
    const body = make('div', 'assistant-body');
    renderMarkdown(body, entry.text);
    if (entry.streaming) body.appendChild(make('span', 'streaming-caret'));
    row.appendChild(body);
    return row;
  }
  if (entry.type === 'thought') {
    if (thoughtDisplay.value === 'hidden') return null;
    const details = make('details', `thought-card${entry.streaming ? ' streaming' : ''}`);
    details.open = thoughtDisplay.value === 'expanded';
    const summary = make('summary');
    summary.append(make('span', 'thought-spinner'), make('span', '', tr(entry.streaming ? '正在思考…' : '思考过程')));
    const body = make('div', 'thought-body');
    if (entry.text) renderMarkdown(body, entry.text);
    else body.appendChild(make('span', 'thought-placeholder', tr('等待 Harness 返回思考内容…')));
    details.append(summary, body);
    return details;
  }
  if (entry.type === 'tool') {
    const card = make('details', `tool-card status-${entry.status || 'pending'}`);
    card.open = Boolean(entry.expanded);
    const header = make('summary', 'tool-header');
    const icon = ({ read: '⌕', search: '⌕', edit: '✎', execute: '›_', fetch: '↗', think: '◇' })[entry.kind] || '◆';
    header.append(make('span', 'tool-icon', icon));
    const title = make('div', 'tool-title');
    title.append(make('strong', '', entry.title || entry.kind || tr('工具调用')), make('span', '', tr(entry.status || 'pending')));
    header.appendChild(title);
    header.addEventListener('click', (event) => {
      event.preventDefault();
      const expanded = !card.open;
      entry.expanded = expanded;
      card.open = expanded;
      if (expanded) {
        userPausedFollow = true;
        followOutput = false;
        lastScrollY = scroller().scrollTop;
      }
      persist();
    });
    card.appendChild(header);
    addToolInformation(card, entry);
    return card;
  }
  if (entry.type === 'plan') {
    const card = make('section', 'plan-card');
    card.appendChild(make('h3', '', tr('执行计划')));
    for (const item of entry.entries || []) {
      const row = make('div', `plan-entry ${item.status || 'pending'}`);
      const mark = item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '●' : '○';
      row.append(make('span', 'plan-mark', mark), make('span', '', item.content || ''));
      card.appendChild(row);
    }
    return card;
  }
  if (entry.type === 'queued') {
    const row = make('article', 'message queued-message');
    const card = make('div', 'queued-bubble');
    const copy = make('div', 'queued-copy');
    copy.append(make('strong', '', tr(`已排队${entry.position ? ` · 第 ${entry.position} 条` : ''}`)), make('span', '', entry.text));
    const remove = make('button', 'queued-remove', '×');
    remove.type = 'button';
    remove.title = tr('取消这条排队消息');
    remove.addEventListener('click', () => vscode.postMessage({ type: 'cancelQueuedPrompt', conversationId: current().id, queueId: entry.queueId }));
    card.append(copy, remove);
    row.appendChild(card);
    return row;
  }
  if (entry.type === 'question') return renderQuestionEntry(entry);
  if (entry.type === 'permission') {
    const card = make('details', `permission-card${entry.resolved ? ' resolved' : ''}`);
    card.open = !entry.resolved;
    const summary = make('summary', 'permission-summary');
    const heading = make('div', 'permission-heading');
    heading.append(
      make('span', 'permission-kicker', tr(entry.resolved ? '审核完成' : '需要用户确认')),
      make('strong', '', entry.toolCall?.title || tr('Harness 请求执行操作')),
    );
    summary.appendChild(heading);
    if (entry.resolved) summary.appendChild(make('span', 'permission-result', tr(`已选择：${entry.selected}`)));
    const body = make('div', 'permission-body');
    addToolInformation(body, entry.toolCall, true);
    const actions = make('div', 'permission-actions');
    for (const option of entry.options || []) {
      const button = make('button', `permission-option ${option.kind || ''}`, tr(option.name));
      button.addEventListener('click', () => {
        vscode.postMessage({ type: 'permissionResponse', requestId: entry.requestId, optionId: option.optionId });
        entry.resolved = true;
        entry.selected = option.name;
        const toolCallId = entry.toolCall?.toolCallId;
        if (toolCallId) {
          for (const candidate of current().entries) {
            if (candidate.type === 'tool' && candidate.toolCallId === toolCallId) candidate.expanded = false;
          }
        }
        render();
      });
      button.disabled = Boolean(entry.resolved);
      actions.appendChild(button);
    }
    body.appendChild(actions);
    card.append(summary, body);
    return card;
  }
  if (entry.type === 'error') {
    const card = make('section', 'error-card');
    card.append(make('strong', '', tr('出现问题')), make('span', '', tr(entry.message)));
    return card;
  }
  if (entry.type === 'notice') return make('div', 'notice', tr(entry.message));
  return make('div', 'notice', printable(entry));
}

function renderHistory() {
  sessionList.replaceChildren();
  const query = sessionSearch.value.trim().toLowerCase();
  const ordered = [...conversations]
    .filter((item) => showArchived.checked ? item.archived : !item.archived)
    .filter((item) => !query || `${item.title}\n${item.entries.map((entry) => entry.text || entry.message || '').join('\n')}`.toLowerCase().includes(query))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 20);
  for (const item of ordered) {
    const row = make('div', `session-item${item.id === activeConversationId ? ' active' : ''}`);
    const button = make('button', 'session-open');
    const name = make('span', 'session-name', item.title);
    const meta = make('span', 'session-meta', `${item.archived ? `${tr('已归档')} · ` : ''}${new Date(item.updatedAt).toLocaleString(uiLanguageValue)}`);
    button.append(name, meta);
    if (item.unread) row.appendChild(make('i', 'unread-dot'));
    button.addEventListener('click', () => selectConversation(item.id));
    const actions = make('div', 'session-actions');
    const fork = make('button', 'session-action', '⑂');
    fork.title = '复制可见记录并开启新 Harness 上下文';
    fork.addEventListener('click', (event) => {
      event.stopPropagation();
      forkConversation(item.id);
    });
    const archive = make('button', 'session-action', item.archived ? '↥' : '▣');
    archive.title = item.archived ? '取消归档' : '归档';
    archive.addEventListener('click', (event) => {
      event.stopPropagation();
      setConversationArchived(item.id, !item.archived);
    });
    const remove = make('button', 'session-action session-delete', '×');
    remove.title = '删除此对话记录';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteConversation(item.id);
    });
    actions.append(fork, archive, remove);
    row.append(button, actions);
    sessionList.appendChild(row);
  }
  if (!ordered.length) sessionList.appendChild(make('div', 'session-empty', query ? '没有匹配的对话' : showArchived.checked ? '还没有归档对话' : '还没有对话'));
  historyDot.hidden = !conversations.some((item) => !item.archived && item.id !== activeConversationId && item.unread);
}

function nextForkTitle(title) {
  const source = String(title || '新对话');
  const match = source.match(/^(.*?)(?:\s*([（(])(\d+)([）)]))$/);
  if (!match) return `${source} (1)`;
  const open = match[2];
  const close = open === '（' ? '）' : ')';
  return `${match[1].trimEnd()} ${open}${Number(match[3]) + 1}${close}`;
}

function forkConversation(id) {
  const source = conversations.find((item) => item.id === id);
  if (!source) return;
  const copiedEntries = source.entries
    .filter((entry) => entry.type !== 'permission' && entry.type !== 'question' && entry.type !== 'queued')
    .map((entry) => ({ ...JSON.parse(JSON.stringify(entry)), streaming: false }));
  const fork = normalizeConversation({
    id: uid(),
    title: nextForkTitle(source.title),
    entries: [...copiedEntries, { type: 'notice', message: 'Fork 已复制可见记录；由于 ACP 暂无原生会话 Fork，此分支使用新的 Harness 上下文。' }],
    forkedFrom: source.id,
    updatedAt: Date.now(),
  });
  conversations.push(fork);
  activeConversationId = fork.id;
  sessionPanel.hidden = true;
  render(true);
  persist(true);
  vscode.postMessage({ type: 'newSession', conversationId: fork.id });
  input.focus();
}

function setConversationArchived(id, archived) {
  const item = conversations.find((candidate) => candidate.id === id);
  if (!item) return;
  item.archived = archived;
  item.updatedAt = Date.now();
  if (archived && activeConversationId === id) {
    const next = conversations.filter((candidate) => !candidate.archived && candidate.id !== id).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (next) selectConversation(next.id);
    else createConversation();
  } else {
    renderHistory();
    persist(true);
  }
}

function deleteConversation(id) {
  conversations = conversations.filter((item) => item.id !== id);
  renderedEntryLimits.delete(id);
  if (activeConversationId === id) activeConversationId = conversations.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id;
  ensureConversation();
  render();
  persist(true);
  vscode.postMessage({ type: 'switchConversation', conversationId: activeConversationId });
}

function clearConversationHistory() {
  if (!globalThis.confirm('删除插件保存的全部本地对话记录？此操作无法撤销。')) return;
  conversations = [];
  renderedEntryLimits.clear();
  activeConversationId = undefined;
  ensureConversation();
  sessionPanel.hidden = true;
  closeSettingsDialog();
  render();
  persist(true);
  vscode.postMessage({ type: 'switchConversation', conversationId: activeConversationId });
}

function clearCurrentConversation() {
  const item = current();
  if (item.activeTurn || compactActive) return;
  if (!globalThis.confirm('清空当前对话并创建新的 Harness 上下文？其他对话记录不会受影响。')) return;
  closeSettingsDialog();
  composerHint.textContent = '正在创建新的空白上下文…';
  vscode.postMessage({ type: 'clearConversation', conversationId: item.id });
}

function scroller() {
  return document.scrollingElement || document.documentElement;
}

function maxScrollTop(root = scroller()) {
  return Math.max(0, root.scrollHeight - root.clientHeight);
}

function nearBottom(threshold = 12) {
  const root = scroller();
  return maxScrollTop(root) - root.scrollTop <= threshold;
}

function pinToBottom() {
  if (userPausedFollow || !followOutput) return;
  const root = scroller();
  programmaticScroll = true;
  root.scrollTop = maxScrollTop(root);
  lastScrollY = root.scrollTop;
  requestAnimationFrame(() => {
    if (userPausedFollow || !followOutput) {
      programmaticScroll = false;
      return;
    }
    root.scrollTop = maxScrollTop(root);
    lastScrollY = root.scrollTop;
    programmaticScroll = false;
  });
}

function selectOptions(option) {
  const result = [];
  for (const candidate of Array.isArray(option?.options) ? option.options : []) {
    if (Array.isArray(candidate?.options)) result.push(...candidate.options);
    else result.push(candidate);
  }
  return result;
}

function renderSessionControls(item) {
  sessionControls.replaceChildren();
  const modes = item.modes;
  const configOptions = Array.isArray(item.configOptions) ? item.configOptions : [];
  if (!modes?.availableModes?.length && !configOptions.length) {
    sessionControls.hidden = true;
    return;
  }
  sessionControls.hidden = false;
  if (modes?.availableModes?.length) {
    const label = make('label', 'session-control');
    label.appendChild(make('span', '', '模式'));
    const select = make('select', 'session-control-select');
    for (const mode of modes.availableModes) {
      const option = make('option', '', mode.name || mode.id);
      option.value = mode.id;
      option.title = mode.description || '';
      select.appendChild(option);
    }
    select.value = modes.currentModeId || '';
    select.disabled = item.activeTurn;
    select.addEventListener('change', () => vscode.postMessage({
      type: 'setSessionMode', conversationId: item.id, modeId: select.value,
    }));
    label.appendChild(select);
    sessionControls.appendChild(label);
  }
  for (const config of configOptions) {
    const label = make('label', 'session-control');
    label.title = config.description || '';
    label.appendChild(make('span', '', config.name || config.id));
    if (config.type === 'boolean') {
      const checkbox = make('input', 'session-control-checkbox');
      checkbox.type = 'checkbox';
      checkbox.checked = Boolean(config.currentValue);
      checkbox.disabled = item.activeTurn;
      checkbox.addEventListener('change', () => vscode.postMessage({
        type: 'setSessionConfigOption', conversationId: item.id, configId: config.id, value: checkbox.checked,
      }));
      label.appendChild(checkbox);
    } else {
      const select = make('select', 'session-control-select');
      for (const candidate of selectOptions(config)) {
        if (typeof candidate?.value !== 'string') continue;
        const option = make('option', '', candidate.name || candidate.value);
        option.value = candidate.value;
        option.title = candidate.description || '';
        select.appendChild(option);
      }
      select.value = String(config.currentValue ?? '');
      select.disabled = item.activeTurn;
      select.addEventListener('change', () => vscode.postMessage({
        type: 'setSessionConfigOption', conversationId: item.id, configId: config.id, value: select.value,
      }));
      label.appendChild(select);
    }
    sessionControls.appendChild(label);
  }
}

function renderDashboard(item) {
  const goal = normalizeGoal(item.goal);
  const subagents = normalizeSubagents(item.subagents);
  item.goal = goal;
  item.subagents = subagents;
  runtimeDashboard.hidden = !goal && subagents.length === 0;
  goalBar.hidden = !goal;
  if (goal) {
    goalObjective.textContent = goal.objective || '未命名目标';
    goalObjective.title = goal.objective || '未命名目标';
    const phases = { active: '进行中', paused: '已暂停', blocked: '受阻', complete: '已完成' };
    const rounds = goal.maxGoalRounds ? ` · ${goal.roundsStarted}/${goal.maxGoalRounds}` : '';
    goalStatus.textContent = `${phases[goal.phase] || goal.phase}${rounds}`;
    goalStatus.title = goal.blockedReason || goalStatus.textContent;
    goalToggle.hidden = goal.phase === 'complete' || goal.phase === 'blocked';
    goalToggle.textContent = goal.phase === 'paused' ? '恢复' : '暂停';
    goalToggle.dataset.action = goal.phase === 'paused' ? 'resume' : 'pause';
  }

  subagentPanel.hidden = subagents.length === 0;
  const working = subagents.filter((entry) => entry.workStatus === 'working').length;
  const idle = subagents.filter((entry) => entry.workStatus === 'idle').length;
  const ended = subagents.filter((entry) => entry.workStatus === 'ended').length;
  const statusCounts = [
    working ? `工作中 ${working}` : '',
    idle ? `空闲 ${idle}` : '',
    ended ? `已结束 ${ended}` : '',
  ].filter(Boolean).join(' · ');
  subagentSummary.textContent = `共 ${subagents.length}${statusCounts ? `（${statusCounts}）` : ''}`;
  subagentList.replaceChildren();
  for (const agent of subagents) {
    const row = make('div', 'subagent-row');
    row.style.paddingLeft = `${5 + Math.max(0, agent.depth - 1) * 12}px`;
    const state = make('i', `subagent-state ${agent.workStatus}`);
    const copy = make('div', 'subagent-copy');
    const statusLabel = { working: '正在工作', idle: '空闲待命', ended: '已结束' }[agent.workStatus];
    copy.append(make('strong', '', agent.label), make('span', '', `${agent.mode === 'continuable' ? '可继续' : '单次'} · ${statusLabel}`));
    row.append(state, copy);
    if (agent.workStatus === 'working') {
      const stop = make('button', 'dashboard-button subagent-stop', '中断');
      stop.type = 'button';
      stop.addEventListener('click', () => {
        if (!globalThis.confirm(`中断 Subagent“${agent.label}”当前正在执行的任务？`)) return;
        vscode.postMessage({ type: 'interruptSubagent', conversationId: item.id, subagentId: agent.id });
      });
      row.appendChild(stop);
    }
    subagentList.appendChild(row);
  }

  clearTimeout(dashboardTimer);
  if (item.activeTurn || working > 0) {
    dashboardTimer = setTimeout(() => vscode.postMessage({ type: 'refreshDashboard', conversationId: item.id }), 2000);
  }
}

function captureScrollAnchor() {
  const root = scroller();
  const viewportTop = document.querySelector('.context-header')?.getBoundingClientRect().bottom || 0;
  const nodes = [...conversation.children].filter((node) => node.dataset.entryIndex !== undefined);
  const anchor = nodes.find((node) => node.getBoundingClientRect().bottom > viewportTop) || nodes.at(-1);
  if (!anchor) return { scrollTop: root.scrollTop };
  return {
    entryIndex: anchor.dataset.entryIndex,
    viewportOffset: anchor.getBoundingClientRect().top,
    scrollTop: root.scrollTop,
  };
}

function restoreScrollAnchor(anchor, root = scroller()) {
  if (anchor?.entryIndex !== undefined) {
    const node = conversation.querySelector(`[data-entry-index="${anchor.entryIndex}"]`);
    if (node) {
      root.scrollTop = Math.max(0, root.scrollTop + node.getBoundingClientRect().top - anchor.viewportOffset);
      return;
    }
  }
  root.scrollTop = Math.min(anchor?.scrollTop || 0, maxScrollTop(root));
}

function scheduleRender(forceScroll = false) {
  renderPendingForceScroll ||= forceScroll;
  if (renderTimer) return;
  const elapsed = performance.now() - lastRenderAt;
  const delay = Math.max(0, STREAM_RENDER_INTERVAL_MS - elapsed);
  renderTimer = setTimeout(() => {
    renderTimer = undefined;
    const pendingForceScroll = renderPendingForceScroll;
    renderPendingForceScroll = false;
    render(pendingForceScroll);
  }, delay);
}

function render(forceScroll = false) {
  if (renderTimer) {
    clearTimeout(renderTimer);
    renderTimer = undefined;
  }
  forceScroll ||= renderPendingForceScroll;
  renderPendingForceScroll = false;
  lastRenderAt = performance.now();
  if (forceScroll) {
    userPausedFollow = false;
    followOutput = true;
  }
  const shouldFollow = forceScroll || (!userPausedFollow && followOutput);
  const scrollYBeforeRender = scroller().scrollTop;
  const scrollAnchor = shouldFollow ? undefined : captureScrollAnchor();
  const interactionBeforeRender = scrollInteractionVersion;
  const epoch = ++renderEpoch;
  programmaticScroll = true;
  const item = current();
  for (const node of [...conversation.children]) if (node.id !== 'welcome') node.remove();
  welcome.hidden = item.entries.length > 0;
  const renderLimit = renderedEntryLimits.get(item.id) || RENDER_ENTRY_PAGE_SIZE;
  const firstRenderedIndex = Math.max(0, item.entries.length - renderLimit);
  if (firstRenderedIndex > 0) {
    const loadEarlier = make('button', 'load-earlier-entries', `${tr('显示更早的消息')} · ${firstRenderedIndex}`);
    loadEarlier.type = 'button';
    loadEarlier.addEventListener('click', () => {
      renderedEntryLimits.set(item.id, renderLimit + RENDER_ENTRY_PAGE_SIZE);
      render();
    });
    conversation.appendChild(loadEarlier);
  }
  item.entries.slice(firstRenderedIndex).forEach((entry, offset) => {
    const entryIndex = firstRenderedIndex + offset;
    const node = renderEntry(entry);
    if (node) {
      node.dataset.entryIndex = String(entryIndex);
      conversation.appendChild(node);
    }
  });
  conversationTitle.value = item.title === '新对话' ? tr('新对话') : item.title;
  renderUsage(item);
  renderSessionControls(item);
  renderDashboard(item);
  activeTurn = item.activeTurn;
  const busy = activeTurn || compactActive;
  const cancelState = item.cancelState || 'idle';
  send.hidden = compactActive;
  cancel.hidden = !busy && cancelState === 'idle';
  if (cancelState === 'requested') {
    cancel.textContent = '停止中…';
    cancel.disabled = true;
    cancel.classList.add('cancel-pending');
    cancel.classList.remove('cancel-stopped', 'cancel-unconfirmed');
  } else if (cancelState === 'stopped') {
    cancel.textContent = '已确认停止 ✓';
    cancel.disabled = false;
    cancel.classList.add('cancel-stopped');
    cancel.classList.remove('cancel-pending', 'cancel-unconfirmed');
  } else if (cancelState === 'escalated') {
    cancel.textContent = '尚未停止';
    cancel.disabled = true;
    cancel.classList.add('cancel-unconfirmed');
    cancel.classList.remove('cancel-pending', 'cancel-stopped');
  } else {
    cancel.textContent = '■';
    cancel.disabled = false;
    cancel.classList.remove('cancel-pending', 'cancel-stopped', 'cancel-unconfirmed');
  }
  const compactionEnabled = managedFeatureGroups.find((group) => group.id === 'compaction')?.enabled !== false;
  compact.disabled = busy || !status.classList.contains('connected') || !compactionEnabled;
  compact.title = compactionEnabled ? '压缩较早的对话上下文（可能调用摘要模型并产生费用）' : '上下文压缩功能组当前已关闭';
  clearConversation.disabled = busy || !status.classList.contains('connected');
  usageCompact.disabled = compact.disabled;
  usageClear.disabled = clearConversation.disabled;
  input.disabled = compactActive;
  send.disabled = !status.classList.contains('connected') || compactActive || cancelState === 'requested' || cancelState === 'escalated';
  const queuedCount = item.entries.filter((entry) => entry.type === 'queued').length;
  send.title = activeTurn ? '排队发送（Ctrl+Enter 立即插话）' : '发送';
  send.setAttribute('aria-label', send.title);
  send.classList.toggle('queue-button', activeTurn);
  if (composerModel.options.length > 0) composerModel.value = conversationModelId(item);
  composerModel.disabled = busy;
  const activeModel = modelInfo(conversationModelId(item));
  if (activeModel) modelLabel.textContent = activeModel.label;
  attachImage.hidden = !conversationSupportsVision(item);
  renderImageChips();
  if (cancelState === 'requested') composerHint.textContent = '正在等待 Harness 确认停止…';
  else if (cancelState === 'escalated') composerHint.textContent = 'Harness 尚未确认停止';
  else if (cancelState === 'stopped') composerHint.textContent = 'Harness 已确认结束本轮任务';
  else if (activeTurn) composerHint.textContent = `思考中 · Enter 排队${queuedCount ? `（${queuedCount}）` : ''} · Ctrl+Enter 立即插话`;
  renderHistory();
  renderFeatureGroups();
  refreshChrome();
  persist();
  requestAnimationFrame(() => {
    if (epoch !== renderEpoch) return;
    const root = scroller();
    if (shouldFollow && !userPausedFollow) {
      root.scrollTop = maxScrollTop(root);
      followOutput = true;
    } else if (interactionBeforeRender === scrollInteractionVersion) {
      // 按可见消息锚点复位，避免流式重绘与顶部状态栏变高时产生视觉回跳。
      restoreScrollAnchor(scrollAnchor || { scrollTop: scrollYBeforeRender }, root);
    }
    requestAnimationFrame(() => {
      if (epoch !== renderEpoch) return;
      // 二次校正：布局稳定后若仍在跟随，再钉一次真正的底部，防止流式内容晚到导致差一截。
      if (shouldFollow && !userPausedFollow) {
        root.scrollTop = maxScrollTop(root);
      }
      lastScrollY = root.scrollTop;
      programmaticScroll = false;
    });
  });
}

function closeStreams(item) {
  for (const entry of item.entries) if (entry.type === 'assistant' || entry.type === 'thought') entry.streaming = false;
}

function appendBoundedStreamText(entry, value) {
  const chunk = String(value || '');
  if (!chunk || entry.contentTruncated) return;
  if (entry.text.length + chunk.length <= MAX_STREAM_ENTRY_CHARS) {
    entry.text += chunk;
    return;
  }
  const marker = '\n\n[内容过长，界面仅保留前 256K 字符]';
  const available = Math.max(0, MAX_STREAM_ENTRY_CHARS - entry.text.length - marker.length);
  entry.text += `${chunk.slice(0, available)}${marker}`;
  entry.contentTruncated = true;
}

function boundedToolField(value) {
  if (typeof value === 'string') {
    if (value.length <= MAX_RUNTIME_TOOL_FIELD_CHARS) return value;
    return `${value.slice(0, MAX_RUNTIME_TOOL_FIELD_CHARS)}\n\n[工具字段过长，已截断]`;
  }
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= MAX_RUNTIME_TOOL_FIELD_CHARS) return value;
    return {
      truncated: true,
      originalCharacters: serialized.length,
      preview: serialized.slice(0, MAX_RUNTIME_TOOL_FIELD_CHARS),
    };
  } catch {
    return '[无法序列化的工具字段]';
  }
}

function trimRuntimeEntries(item) {
  if (item.entries.length <= MAX_RUNTIME_ENTRIES) return;
  item.entries.splice(0, item.entries.length - RUNTIME_ENTRY_TRIM_TARGET);
}

function appendChunk(item, type, update) {
  const key = update.messageId || `${type}-current`;
  let target = [...item.entries].reverse().find((entry) => entry.type === type && entry.key === key && entry.streaming);
  if (!target && type === 'thought') {
    target = [...item.entries].reverse().find((entry) => entry.type === 'thought' && entry.streaming && !entry.text);
  }
  if (!target) {
    target = { type, key, text: '', streaming: true };
    item.entries.push(target);
  }
  if (update.content?.type === 'text') appendBoundedStreamText(target, update.content.text);
}

function updateTool(item, update, isNew) {
  let tool = item.entries.find((entry) => entry.type === 'tool' && entry.toolCallId === update.toolCallId);
  if (!tool) {
    tool = { type: 'tool', toolCallId: update.toolCallId };
    item.entries.push(tool);
  }
  for (const key of ['title', 'kind', 'status', 'content', 'rawInput', 'rawOutput', 'locations']) {
    if (update[key] !== undefined && update[key] !== null) {
      tool[key] = ['content', 'rawInput', 'rawOutput', 'locations'].includes(key)
        ? boundedToolField(update[key])
        : String(update[key]).slice(0, 2048);
    }
  }
  for (const permission of item.entries.filter((entry) => entry.type === 'permission' && entry.toolCall?.toolCallId === update.toolCallId)) {
    permission.toolCall = { ...permission.toolCall, ...tool };
  }
  if (isNew && !tool.status) tool.status = 'pending';
}

function handleUpdate(conversationId, update) {
  if (!update?.sessionUpdate) return;
  const item = ensureConversation(conversationId);
  if (['agent_message_chunk', 'agent_thought_chunk', 'tool_call', 'tool_call_update', 'plan'].includes(update.sessionUpdate)) markTurnActivity(item);
  switch (update.sessionUpdate) {
    case 'agent_message_chunk': appendChunk(item, 'assistant', update); break;
    case 'agent_thought_chunk': appendChunk(item, 'thought', update); break;
    case 'tool_call': closeStreams(item); updateTool(item, update, true); break;
    case 'tool_call_update': updateTool(item, update, false); break;
    case 'plan': item.entries.push({ type: 'plan', entries: Array.isArray(update.entries) ? update.entries.slice(0, 200) : [] }); break;
    case 'usage_update':
      if (update._meta?.clientUsage) addUsage(item, update._meta.clientUsage);
      if (update.size > 0) item.contextUsage = { used: tokenCount(update.used), size: tokenCount(update.size) };
      if (item.id === activeConversationId && update.size > 0) composerHint.textContent = `上下文 ${Math.round(update.used || 0).toLocaleString()} / ${Math.round(update.size).toLocaleString()}`;
      break;
    case 'current_mode_update':
      if (item.modes) item.modes = { ...item.modes, currentModeId: update.currentModeId };
      break;
    case 'config_option_update':
      item.configOptions = Array.isArray(update.configOptions) ? update.configOptions : item.configOptions;
      break;
    default: break;
  }
  trimRuntimeEntries(item);
  item.updatedAt = Date.now();
  if (item.id !== activeConversationId) item.unread = true;
  if (item.id === activeConversationId) scheduleRender();
  else {
    historyDot.hidden = false;
    persist();
  }
}

function setConnection(stateName, message) {
  status.className = `status ${stateName}`;
  status.querySelector('span').textContent = message || stateName;
  managementStatus.textContent = message || stateName;
  managementStatus.classList.toggle('management-ok', stateName === 'connected');
  managementStatus.classList.toggle('management-bad', stateName === 'error');
  const cancelState = current().cancelState || 'idle';
  send.disabled = stateName !== 'connected' || compactActive || cancelState === 'requested' || cancelState === 'escalated';
  const compactionEnabled = managedFeatureGroups.find((group) => group.id === 'compaction')?.enabled !== false;
  compact.disabled = stateName !== 'connected' || activeTurn || compactActive || !compactionEnabled;
  refreshChrome();
}

function selectConversation(id) {
  if (!id || id === activeConversationId) {
    sessionPanel.hidden = true;
    return;
  }
  activeConversationId = id;
  const item = current();
  compactActive = false;
  item.unread = false;
  sessionPanel.hidden = true;
  setUsagePanelOpen(false);
  closeSettingsDialog();
  composerHint.textContent = 'Enter 发送 · Shift+Enter 换行';
  render();
  vscode.postMessage({ type: 'switchConversation', conversationId: id, sessionId: item.sessionId });
}

function createConversation() {
  const item = normalizeConversation({ id: uid(), title: '新对话' });
  conversations.push(item);
  activeConversationId = item.id;
  sessionPanel.hidden = true;
  setUsagePanelOpen(false);
  closeSettingsDialog();
  render();
  vscode.postMessage({ type: 'newSession', conversationId: item.id });
  input.focus();
}

function executeSlashCommand(text, item) {
  const command = text.trim().toLowerCase();
  if (command === '/compact') {
    vscode.postMessage({ type: 'compact', conversationId: item.id });
    return true;
  }
  if (command === '/clear') {
    clearCurrentConversation();
    return true;
  }
  if (command === '/new') {
    createConversation();
    return true;
  }
  if (command === '/history') {
    sessionPanel.hidden = false;
    renderHistory();
    sessionSearch.focus();
    return true;
  }
  if (command === '/archive') {
    setConversationArchived(item.id, true);
    return true;
  }
  if (command === '/fork') {
    forkConversation(item.id);
    return true;
  }
  if (command === '/settings') {
    openSettingsDialog();
    return true;
  }
  if (command === '/help') {
    item.entries.push({ type: 'notice', message: SLASH_COMMANDS.map((entry) => `${entry.command} — ${entry.detail}`).join('\n') });
    render(true);
    return true;
  }
  if (command === '/plan' || command === '/code') {
    const needle = command.slice(1);
    const mode = item.modes?.availableModes?.find((candidate) => `${candidate.id} ${candidate.name}`.toLowerCase().includes(needle));
    if (mode) {
      vscode.postMessage({ type: 'setSessionMode', conversationId: item.id, modeId: mode.id });
      item.entries.push({ type: 'notice', message: `正在切换到 ${mode.name || mode.id} 模式…` });
      render(true);
      return true;
    }
    if (command === '/code') {
      startTurnTelemetry(item);
      vscode.postMessage({ type: 'send', conversationId: item.id, text: '/plan off' });
      render(true);
      return true;
    }
  }
  return false;
}

function submit(options = {}) {
  const text = input.value.trim();
  const images = currentDraftImages();
  if ((!text && images.length === 0) || compactActive) return;
  const item = current();
  if (text && !item.activeTurn && executeSlashCommand(text, item)) {
    input.value = '';
    resizeInput();
    fileSuggestions.hidden = true;
    return;
  }
  if (item.activeTurn && images.length > 0) {
    composerHint.textContent = tr('带图片的消息不能排队或插话，请等当前任务结束后发送。');
    return;
  }
  if (item.title === '新对话') item.title = (text || (images[0]?.name ?? '')).replace(/\s+/g, ' ').slice(0, 36) || '新对话';
  input.value = '';
  resizeInput();
  fileSuggestions.hidden = true;
  if (!item.activeTurn) startTurnTelemetry(item);
  render(true);
  if (item.activeTurn) {
    vscode.postMessage({ type: options.steer === true ? 'steerQueued' : 'enqueuePrompt', conversationId: item.id, queueId: uid(), text });
  } else {
    const payloadImages = images.map(({ name, mimeType, data }) => ({ name, mimeType, data }));
    draftImagesByConversation.set(item.id, []);
    renderImageChips();
    vscode.postMessage({
      type: 'send', conversationId: item.id, text,
      ...(payloadImages.length ? { images: payloadImages } : {}),
    });
  }
}

function renderImageChips() {
  const images = currentDraftImages();
  imageChips.replaceChildren();
  imageChips.hidden = images.length === 0;
  images.forEach((image, index) => {
    const chip = make('span', 'image-chip');
    const thumb = document.createElement('img');
    thumb.src = image.dataUrl;
    thumb.alt = image.name;
    const label = make('span', 'image-chip-name', `${image.name} · ${Math.max(1, Math.round(image.bytes / 1024))}KB`);
    const remove = make('button', 'image-chip-remove', '×');
    remove.type = 'button';
    remove.title = tr('移除图片');
    remove.addEventListener('click', () => {
      images.splice(index, 1);
      renderImageChips();
    });
    chip.append(thumb, label, remove);
    imageChips.appendChild(chip);
  });
}

function addDraftImageFile(file) {
  if (!file || !IMAGE_MIME_SET.has(file.type)) return;
  const item = current();
  if (!conversationSupportsVision(item)) {
    composerHint.textContent = tr('当前模型不支持图片，请先切换到 Vision 模型。');
    return;
  }
  const images = currentDraftImages();
  if (images.length >= imageLimits.maxImages) {
    composerHint.textContent = `一次最多发送 ${imageLimits.maxImages} 张图片。`;
    return;
  }
  if (file.size > imageLimits.maxImageBytes) {
    composerHint.textContent = `单张图片超过 ${Math.floor(imageLimits.maxImageBytes / 1024 / 1024)}MB 上限。`;
    return;
  }
  const totalBytes = images.reduce((sum, image) => sum + image.bytes, 0) + file.size;
  if (totalBytes > imageLimits.maxMessageImageBytes) {
    composerHint.textContent = `图片合计超过 ${Math.floor(imageLimits.maxMessageImageBytes / 1024 / 1024)}MB 上限。`;
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || '');
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (!base64) return;
    images.push({ name: file.name || 'image', mimeType: file.type, bytes: file.size, data: base64, dataUrl });
    renderImageChips();
  };
  reader.readAsDataURL(file);
}

function resizeInput() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
}

send.addEventListener('click', (event) => submit({ steer: event.ctrlKey || event.metaKey }));
attachImage.addEventListener('click', () => imageFileInput.click());
imageFileInput.addEventListener('change', () => {
  for (const file of imageFileInput.files || []) addDraftImageFile(file);
  imageFileInput.value = '';
});
input.addEventListener('paste', (event) => {
  const files = [...(event.clipboardData?.items || [])]
    .filter((entry) => entry.kind === 'file')
    .map((entry) => entry.getAsFile())
    .filter((file) => file && IMAGE_MIME_SET.has(file.type));
  if (!files.length) return;
  event.preventDefault();
  for (const file of files) addDraftImageFile(file);
});
composerModel.addEventListener('change', () => {
  const item = current();
  const model = composerModel.value;
  if (!model || model === conversationModelId(item)) return;
  if (item.sessionId && item.entries.length > 0 && !globalThis.confirm(tr('切换模型会重置 Harness 上下文（聊天记录保留）。继续？'))) {
    composerModel.value = conversationModelId(item);
    return;
  }
  item.model = model;
  if (modelInfo(model)?.vision !== true) draftImagesByConversation.set(item.id, []);
  vscode.postMessage({ type: 'setConversationModel', conversationId: item.id, model });
  render();
  persist();
});
cancel.addEventListener('click', () => vscode.postMessage({ type: 'cancel', conversationId: activeConversationId }));
compact.addEventListener('click', requestCompact);
newSession.addEventListener('click', createConversation);
settings.addEventListener('click', openSettingsDialog);
usageButton.addEventListener('click', (event) => {
  event.stopPropagation();
  setUsagePanelOpen(usagePanel.hidden);
});
contextMeter.addEventListener('click', (event) => {
  event.stopPropagation();
  setUsagePanelOpen(usagePanel.hidden);
});
usageCompact.addEventListener('click', requestCompact);
usageClear.addEventListener('click', () => {
  setUsagePanelOpen(false);
  clearCurrentConversation();
});
closeSettings.addEventListener('click', closeSettingsDialog);
settingsOverlay.addEventListener('click', (event) => { if (event.target === settingsOverlay) closeSettingsDialog(); });
openAdvancedSettings.addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
openLogs.addEventListener('click', () => vscode.postMessage({ type: 'openLogs' }));
copyDiagnostics.addEventListener('click', () => vscode.postMessage({ type: 'copyDiagnostics' }));
restartRuntime.addEventListener('click', () => vscode.postMessage({ type: 'restartRuntime', conversationId: activeConversationId }));
refreshDiagnostics.addEventListener('click', () => vscode.postMessage({ type: 'requestDiagnostics' }));
openCordisConfig.addEventListener('click', () => vscode.postMessage({ type: 'openCordisConfig' }));
openPluginDirectory.addEventListener('click', () => vscode.postMessage({ type: 'openPluginDirectory' }));
history.addEventListener('click', () => { sessionPanel.hidden = !sessionPanel.hidden; renderHistory(); });
closeHistory.addEventListener('click', () => { sessionPanel.hidden = true; });
sessionSearch.addEventListener('input', renderHistory);
showArchived.addEventListener('change', renderHistory);
clearConversation.addEventListener('click', clearCurrentConversation);
clearHistory.addEventListener('click', clearConversationHistory);
conversationTitle.addEventListener('change', () => {
  current().title = canonicalConversationTitle(conversationTitle.value) || '新对话';
  current().updatedAt = Date.now();
  render();
});
conversationTitle.addEventListener('keydown', (event) => { if (event.key === 'Enter') conversationTitle.blur(); });
approvalMode.addEventListener('change', () => {
  composerApprovalMode.value = approvalMode.value;
  vscode.postMessage({ type: 'setApprovalMode', value: approvalMode.value });
});
composerApprovalMode.addEventListener('change', () => {
  approvalMode.value = composerApprovalMode.value;
  vscode.postMessage({ type: 'setApprovalMode', value: composerApprovalMode.value });
});
autoAllowRead.addEventListener('change', () => {
  vscode.postMessage({ type: 'setAutoAllowRead', value: autoAllowRead.checked });
});
thoughtDisplay.addEventListener('change', () => {
  vscode.postMessage({ type: 'setThoughtDisplay', value: thoughtDisplay.value });
  render();
});
uiLanguage.addEventListener('change', () => {
  applyUiLanguage(uiLanguage.value);
  vscode.postMessage({ type: 'setUiLanguage', value: uiLanguageValue });
});
goalToggle.addEventListener('click', () => {
  const action = goalToggle.dataset.action;
  if (action !== 'pause' && action !== 'resume') return;
  vscode.postMessage({ type: 'goalAction', conversationId: activeConversationId, action });
});
goalClear.addEventListener('click', () => {
  if (!globalThis.confirm('清除当前 Goal？这不会删除聊天记录。')) return;
  vscode.postMessage({ type: 'goalAction', conversationId: activeConversationId, action: 'clear' });
});
conversation.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-external-url]');
  if (!link) return;
  event.preventDefault();
  vscode.postMessage({ type: 'openExternal', url: link.dataset.externalUrl });
});
document.addEventListener('click', (event) => {
  if (!usagePanel.hidden && !event.target.closest('#usageButton') && !event.target.closest('#contextMeter') && !event.target.closest('#usagePanel')) {
    setUsagePanelOpen(false);
  }
});
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '0'].includes(event.key)) event.preventDefault();
  if (event.key === 'Escape') {
    if (!usagePanel.hidden) {
      setUsagePanelOpen(false);
    }
    if (!settingsOverlay.hidden) closeSettingsDialog();
  }
});
input.addEventListener('input', resizeInput);
window.addEventListener('wheel', (event) => {
  scrollInteractionVersion += 1;
  if (event.ctrlKey) {
    event.preventDefault();
    return;
  }
  if (event.deltaY < 0) {
    userPausedFollow = true;
    followOutput = false;
  } else if (!nearBottom(64)) {
    userPausedFollow = true;
    followOutput = false;
  } else if (nearBottom(64)) {
    userPausedFollow = false;
    followOutput = true;
  }
}, { passive: false });
window.addEventListener('pointerdown', (event) => {
  // A manual drag on the right scrollbar must not be mistaken for automatic stream scrolling.
  if (event.clientX < window.innerWidth - 24) return;
  programmaticScroll = false;
  userPausedFollow = true;
  followOutput = false;
  scrollInteractionVersion += 1;
}, { passive: true });
window.addEventListener('scroll', () => {
  const nextScrollY = scroller().scrollTop;
  if (programmaticScroll) {
    lastScrollY = nextScrollY;
    return;
  }
  scrollInteractionVersion += 1;
  if (nextScrollY < lastScrollY - 1) {
    userPausedFollow = true;
    followOutput = false;
  } else if (userPausedFollow && nextScrollY > lastScrollY && nearBottom(64)) {
    userPausedFollow = false;
    followOutput = true;
  } else if (!userPausedFollow) {
    followOutput = nearBottom(64);
  }
  lastScrollY = nextScrollY;
}, { passive: true });

if (typeof ResizeObserver === 'function') {
  const followResizeObserver = new ResizeObserver(() => {
    if (userPausedFollow || !followOutput) return;
    cancelAnimationFrame(resizeFollowFrame);
    resizeFollowFrame = requestAnimationFrame(pinToBottom);
  });
  followResizeObserver.observe(conversation);
  const composerShell = document.querySelector('.composer-shell');
  if (composerShell) followResizeObserver.observe(composerShell);
}

input.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !fileSuggestions.hidden) {
    event.preventDefault();
    fileSuggestions.hidden = true;
    return;
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submit({ steer: event.ctrlKey || event.metaKey });
  }
});

function updateFileSuggestions() {
  clearTimeout(fileSuggestTimer);
  const caret = input.selectionStart;
  const prefix = input.value.slice(0, caret);
  const slashMatch = prefix.match(/^\s*\/(\S*)$/);
  if (slashMatch) {
    fileMentionRange = undefined;
    slashCommandRange = { start: prefix.lastIndexOf('/'), end: caret };
    showSlashSuggestions(slashMatch[1]);
    return;
  }
  slashCommandRange = undefined;
  const match = prefix.match(/(?:^|\s)@([^\s@]*)$/);
  if (!match) {
    fileMentionRange = undefined;
    fileSuggestions.hidden = true;
    return;
  }
  const tokenStart = caret - match[1].length - 1;
  fileMentionRange = { start: tokenStart, end: caret };
  fileSuggestRequestId = uid();
  fileSuggestTimer = setTimeout(() => vscode.postMessage({
    type: 'listFiles', query: match[1], requestId: fileSuggestRequestId,
  }), 120);
}

function showSlashSuggestions(query) {
  fileSuggestions.replaceChildren();
  const needle = String(query || '').toLowerCase();
  const matches = SLASH_COMMANDS.filter((entry) => !needle || `${entry.command} ${entry.detail}`.toLowerCase().includes(needle)).slice(0, 10);
  for (const entry of matches) {
    const button = make('button', 'file-suggestion slash-suggestion');
    button.type = 'button';
    button.append(make('strong', '', entry.command), make('small', '', entry.detail));
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      input.setRangeText(entry.command, slashCommandRange.start, slashCommandRange.end, 'end');
      slashCommandRange = undefined;
      fileSuggestions.hidden = true;
      resizeInput();
      input.focus();
    });
    fileSuggestions.appendChild(button);
  }
  fileSuggestions.hidden = matches.length === 0;
}

input.addEventListener('input', updateFileSuggestions);
input.addEventListener('blur', () => setTimeout(() => { fileSuggestions.hidden = true; }, 150));

function showFileSuggestions(files) {
  fileSuggestions.replaceChildren();
  if (!fileMentionRange || !Array.isArray(files) || files.length === 0) {
    fileSuggestions.hidden = true;
    return;
  }
  for (const file of files.slice(0, 12)) {
    const button = make('button', 'file-suggestion', file);
    button.type = 'button';
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      const reference = /\s/.test(file) ? `@"${file}"` : `@${file}`;
      input.setRangeText(reference, fileMentionRange.start, fileMentionRange.end, 'end');
      fileMentionRange = undefined;
      fileSuggestions.hidden = true;
      resizeInput();
      input.focus();
    });
    fileSuggestions.appendChild(button);
  }
  fileSuggestions.hidden = false;
}

window.addEventListener('message', ({ data }) => {
  const item = data.conversationId ? ensureConversation(data.conversationId) : current();
  switch (data.type) {
    case 'configuration': {
      applyUiLanguage(data.uiLanguage || 'zh-CN', false);
      modelLabel.textContent = data.model || 'DeepSeek';
      if (Array.isArray(data.models) && data.models.length) {
        availableModels = data.models.map((model) => ({
          id: String(model.id || ''),
          label: String(model.label || model.id || ''),
          vision: model.vision === true,
        })).filter((model) => model.id);
        populateModelSelect();
      }
      if (typeof data.defaultModel === 'string' && data.defaultModel) defaultModelId = data.defaultModel;
      if (data.imageLimits && typeof data.imageLimits === 'object') {
        imageLimits = {
          maxImages: tokenCount(data.imageLimits.maxImages) || imageLimits.maxImages,
          maxImageBytes: tokenCount(data.imageLimits.maxImageBytes) || imageLimits.maxImageBytes,
          maxMessageImageBytes: tokenCount(data.imageLimits.maxMessageImageBytes) || imageLimits.maxMessageImageBytes,
        };
      }
      workspaceBar.textContent = data.cwd || '';
      workspaceBar.title = `配置：${data.configRoot || ''}`;
      setApprovalModeControls(data.approvalMode || 'manual');
      autoAllowRead.checked = Array.isArray(data.autoAllowTools) && data.autoAllowTools.includes('read');
      thoughtDisplay.value = data.thoughtDisplay || 'collapsed';
      updateManagementConfiguration(data);
      runtimeId = data.runtimeId;
      if (!configured && data.savedState?.conversations?.length) {
        conversations = data.savedState.conversations.map(normalizeConversation);
        activeConversationId = data.savedState.activeConversationId || conversations[0]?.id;
      }
      configured = true;
      render();
      break;
    }
    case 'uiLanguageChanged':
      applyUiLanguage(data.value || 'zh-CN');
      break;
    case 'connection': setConnection(data.state, data.message); break;
    case 'session':
      item.sessionId = data.sessionId;
      item.runtimeId = data.runtimeId;
      if (typeof data.model === 'string' && data.model) item.model = data.model;
      item.modes = data.modes;
      item.configOptions = Array.isArray(data.configOptions) ? data.configOptions : [];
      runtimeId = data.runtimeId || runtimeId;
      render();
      persist();
      break;
    case 'sessionModeChanged':
      if (item.modes) item.modes.currentModeId = data.modeId;
      render();
      break;
    case 'sessionConfigChanged':
      item.configOptions = Array.isArray(data.configOptions) ? data.configOptions : [];
      render();
      break;
    case 'fileSuggestions':
      if (data.requestId === fileSuggestRequestId) showFileSuggestions(data.files);
      break;
    case 'insertInput': {
      const text = String(data.text || '');
      input.value = input.value ? `${input.value}\n\n${text}` : text;
      resizeInput();
      input.focus();
      break;
    }
    case 'conversationSelected': render(); break;
    case 'createConversationRequest': createConversation(); break;
    case 'userMessage':
      closeStreams(item);
      item.entries.push({
        type: 'user',
        text: data.text,
        steering: Boolean(data.steering),
        ...(Array.isArray(data.images) && data.images.length ? {
          images: data.images.slice(0, 16).map((image) => ({
            name: String(image?.name || 'image').slice(0, 120),
            bytes: tokenCount(image?.bytes),
          })),
        } : {}),
      });
      item.updatedAt = Date.now();
      render();
      break;
    case 'conversationModel':
      if (typeof data.model === 'string' && data.model) item.model = data.model;
      render();
      persist();
      break;
    case 'sessionUpdate': handleUpdate(data.conversationId, data.update); break;
    case 'dashboardState':
      item.goal = normalizeGoal(data.goal);
      item.subagents = normalizeSubagents(data.subagents);
      item.updatedAt = Date.now();
      render();
      break;
    case 'permission': {
      const cached = item.entries.find((entry) => entry.type === 'tool' && entry.toolCallId === data.toolCall?.toolCallId);
      item.entries.push({ type: 'permission', ...data, toolCall: { ...(cached || {}), ...(data.toolCall || {}) } });
      item.updatedAt = Date.now();
      if (item.id !== activeConversationId) item.unread = true;
      render();
      break;
    }
    case 'question':
      item.entries.push({ type: 'question', requestId: data.requestId, questions: data.questions || [], resolved: false });
      item.updatedAt = Date.now();
      if (item.id !== activeConversationId) item.unread = true;
      render();
      break;
    case 'questionCancelled': {
      const question = item.entries.find((entry) => entry.type === 'question' && entry.requestId === data.requestId);
      if (question) {
        question.resolved = true;
        question.answers = [];
      }
      render();
      break;
    }
    case 'queuedPrompt':
      item.entries.push({ type: 'queued', queueId: data.queueId, text: data.text, position: data.position });
      item.updatedAt = Date.now();
      render();
      break;
    case 'queuedPromptStarted':
      item.entries = item.entries.filter((entry) => entry.type !== 'queued' || entry.queueId !== data.queueId);
      render();
      break;
    case 'queuedPromptCancelled':
      item.entries = item.entries.filter((entry) => entry.type !== 'queued' || entry.queueId !== data.queueId);
      render();
      break;
    case 'queuedPromptsSteering': {
      const ids = new Set(Array.isArray(data.queueIds) ? data.queueIds : []);
      item.entries = item.entries.filter((entry) => entry.type !== 'queued' || !ids.has(entry.queueId));
      render();
      break;
    }
    case 'queuedPromptsCancelled': {
      const ids = new Set(Array.isArray(data.queueIds) ? data.queueIds : []);
      item.entries = item.entries.filter((entry) => entry.type !== 'queued' || !ids.has(entry.queueId));
      if (data.reason) item.entries.push({ type: 'notice', message: data.reason });
      render();
      break;
    }
    case 'turnState':
      item.activeTurn = Boolean(data.active);
      if (data.active && !item.turnTelemetry) startTurnTelemetry(item);
      if (data.active && ![...item.entries].reverse().some((entry) => entry.type === 'thought' && entry.streaming)) {
        item.entries.push({ type: 'thought', key: 'thought-current', text: '', streaming: true });
      }
      if (!data.active) {
        closeStreams(item);
        finishTurnTelemetry(item);
      }
      if (!data.active && item.id === activeConversationId && item.cancelState === 'idle') {
        composerHint.textContent = 'Enter 发送 · Shift+Enter 换行';
      }
      render();
      if (!data.active) persist(true);
      if (!data.active && item.id === activeConversationId) input.focus();
      break;
    case 'turnComplete':
      closeStreams(item);
      finishTurnTelemetry(item);
      if (data.usage?.totalTokens && item.id === activeConversationId) composerHint.textContent = `本轮 ${data.usage.totalTokens.toLocaleString()} tokens`;
      render();
      break;
    case 'compactState':
      compactActive = Boolean(data.active) && item.id === activeConversationId;
      if (data.active) composerHint.textContent = '正在压缩较早的对话上下文…';
      else if (item.id === activeConversationId) composerHint.textContent = 'Enter 发送 · Shift+Enter 换行';
      render();
      break;
    case 'cancelState': {
      if (data.state === 'requested') {
        item.cancelState = 'requested';
        render();
      } else if (data.state === 'stopped') {
        // 幂等处理：重复的 stopped（例如强制重启路径）不重复提示。
        if (item.cancelState !== 'requested' && item.cancelState !== 'escalated') break;
        item.cancelState = 'stopped';
        item.entries.push({ type: 'notice', message: 'Harness 已确认结束本轮任务。' });
        render();
        setTimeout(() => {
          if (item.cancelState !== 'stopped') return;
          item.cancelState = 'idle';
          if (item.id === activeConversationId) composerHint.textContent = 'Enter 发送 · Shift+Enter 换行';
          render();
        }, 1800);
      } else if (data.state === 'escalated') {
        item.cancelState = 'escalated';
        item.entries.push({ type: 'notice', message: '停止请求尚未获得响应，若任务仍未停止，请在弹窗中选择强制停止并重连。' });
        render();
      }
      break;
    }
    case 'connectionNotice': item.entries.push({ type: 'notice', message: data.message }); render(); break;
    case 'restoreInput':
      if (data.conversationId === activeConversationId && !input.value) {
        input.value = data.text || '';
        resizeInput();
      }
      break;
    case 'conversationCleared':
      item.entries = [];
      item.title = '新对话';
      item.sessionId = data.sessionId;
      item.runtimeId = data.runtimeId;
      item.activeTurn = false;
      item.cancelState = 'idle';
      item.usage = normalizeUsage();
      item.usageByTier = { peak: normalizeUsage(), offPeak: normalizeUsage() };
      item.pricingIncomplete = false;
      item.contextUsage = { used: 0, size: 0 };
      item.performance = normalizePerformance();
      item.turnTelemetry = undefined;
      item.updatedAt = Date.now();
      composerHint.textContent = '当前对话和 Harness 上下文已清空';
      render(true);
      persist(true);
      input.focus();
      break;
    case 'error': closeStreams(item); item.entries.push({ type: 'error', message: data.message }); render(); break;
    case 'runtimeReset':
      runtimeId = data.runtimeId;
      if (data.approvalMode) setApprovalModeControls(data.approvalMode);
      if (Array.isArray(data.autoAllowTools)) autoAllowRead.checked = data.autoAllowTools.includes('read');
      if (Array.isArray(data.featureGroups)) {
        managedFeatureGroups = data.featureGroups;
        managementConfiguration.featureGroups = data.featureGroups;
      }
      for (const candidate of conversations) {
        candidate.sessionId = undefined;
        candidate.runtimeId = undefined;
        candidate.activeTurn = false;
        candidate.cancelState = 'idle';
      }
      current().entries.push({ type: 'notice', message: data.message || '权限模式已切换，Harness 运行时已重启。当前界面记录仍保留。' });
      render();
      vscode.postMessage({ type: 'requestDiagnostics' });
      break;
    case 'featureGroupRejected': {
      const group = managedFeatureGroups.find((candidate) => candidate.id === data.groupId);
      if (group) group.enabled = data.enabled !== false;
      renderFeatureGroups();
      break;
    }
    case 'approvalModeRejected': setApprovalModeControls(data.value || 'manual'); break;
    case 'thoughtDisplayChanged': thoughtDisplay.value = data.value; render(); break;
    case 'diagnostics': renderDiagnostics(data); break;
    default: break;
  }
});

window.addEventListener('pagehide', () => persist(true));

render();
setConnection('connecting', '正在连接');
vscode.postMessage({ type: 'ready', conversationId: activeConversationId, state: { conversations, activeConversationId, runtimeId, savedAt: tokenCount(saved.savedAt) } });
