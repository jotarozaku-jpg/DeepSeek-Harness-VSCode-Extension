/* global acquireVsCodeApi */
'use strict';

const vscode = acquireVsCodeApi();
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
const history = document.getElementById('history');
const historyDot = document.getElementById('historyDot');
const closeHistory = document.getElementById('closeHistory');
const clearHistory = document.getElementById('clearHistory');
const sessionPanel = document.getElementById('sessionPanel');
const sessionList = document.getElementById('sessionList');
const conversationTitle = document.getElementById('conversationTitle');
const approvalMode = document.getElementById('approvalMode');
const thoughtDisplay = document.getElementById('thoughtDisplay');

const saved = vscode.getState() || {};
let conversations = Array.isArray(saved.conversations) ? saved.conversations : [];
let activeConversationId = saved.activeConversationId;
let runtimeId = saved.runtimeId;
let activeTurn = false;
let compactActive = false;
let followOutput = true;
let userPausedFollow = false;
let lastScrollY = window.scrollY;
let saveTimer;
let configured = false;
let renderEpoch = 0;
let programmaticScroll = false;
let fileSuggestTimer;
let fileSuggestRequestId;
let fileMentionRange;
const MAX_STORED_CONVERSATIONS = 50;
const MAX_STORED_ENTRIES = 500;
const MAX_STORED_ENTRY_CHARS = 128 * 1024;
const MAX_STORED_STATE_CHARS = 8 * 1024 * 1024;
const V4_PRO_CNY_PER_MILLION = Object.freeze({ cacheHit: 0.025, cacheMiss: 3, output: 6 });

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

function normalizeConversation(item) {
  const entries = (Array.isArray(item?.entries) ? item.entries : []).map((entry) => (
    entry?.type === 'assistant' || entry?.type === 'thought' ? { ...entry, streaming: false } : entry
  ));
  return {
    id: String(item?.id || uid()),
    title: String(item?.title || '新对话'),
    entries,
    unread: Boolean(item?.unread),
    updatedAt: Number(item?.updatedAt || Date.now()),
    sessionId: item?.sessionId,
    runtimeId: item?.runtimeId,
    activeTurn: Boolean(item?.activeTurn),
    modes: item?.modes,
    configOptions: Array.isArray(item?.configOptions) ? item.configOptions : [],
    usage: normalizeUsage(item?.usage),
  };
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

function persist(immediate = false) {
  const storedConversations = [...conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_STORED_CONVERSATIONS)
    .map((item) => ({
      ...item,
      entries: item.entries.slice(-MAX_STORED_ENTRIES).filter((entry) => {
        try { return JSON.stringify(entry).length <= MAX_STORED_ENTRY_CHARS; } catch { return false; }
      }),
    }));
  const state = { conversations: storedConversations, activeConversationId, runtimeId, savedAt: configured ? Date.now() : tokenCount(saved.savedAt) };
  while (JSON.stringify(state).length > MAX_STORED_STATE_CHARS) {
    const target = [...storedConversations].reverse().find((item) => item.entries.length > 0);
    if (!target) break;
    target.entries.shift();
  }
  vscode.setState(state);
  clearTimeout(saveTimer);
  const save = () => vscode.postMessage({ type: 'saveState', state });
  if (immediate) save();
  else saveTimer = setTimeout(save, 250);
}

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function compactTokens(value) {
  const number = tokenCount(value);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(number >= 100_000 ? 0 : 1)}K`;
  return number.toLocaleString();
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
  const cacheCost = usage.cacheReadTokens * V4_PRO_CNY_PER_MILLION.cacheHit / 1_000_000;
  const uncachedCost = (usage.uncachedInputTokens + usage.cacheWriteTokens) * V4_PRO_CNY_PER_MILLION.cacheMiss / 1_000_000;
  const outputCost = usage.outputTokens * V4_PRO_CNY_PER_MILLION.output / 1_000_000;
  usageCost.textContent = `¥${(cacheCost + uncachedCost + outputCost).toFixed(6)}`;
  usageCostBreakdown.textContent = `命中 ¥${cacheCost.toFixed(6)} ＋ 未命中 ¥${uncachedCost.toFixed(6)} ＋ 输出 ¥${outputCost.toFixed(6)}`;
}

function addUsage(item, value) {
  const delta = normalizeUsage(value);
  const usage = normalizeUsage(item.usage);
  for (const key of Object.keys(usage)) usage[key] = tokenCount(usage[key] + delta[key]);
  item.usage = usage;
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
    return `${location?.path || location?.uri || '未知位置'}${line === undefined ? '' : `:${Number(line) + (location?.range ? 1 : 0)}`}`;
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
  addDetail(card, '调用内容', tool?.rawInput, permission ? 'permission-input' : 'tool-output', permission);
  addDetail(card, '涉及位置', locationsText(tool?.locations));
  for (const diff of diffBlocks(tool?.content)) {
    const path = diff.path || diff.filePath || '文件变更';
    const details = make('details', 'tool-details');
    const summary = make('summary', '', `变更 · ${path}`);
    const diffButton = make('button', 'open-diff-button', '在 VS Code 打开差分');
    diffButton.type = 'button';
    diffButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      vscode.postMessage({ type: 'openDiff', path, oldText: diff.oldText || '', newText: diff.newText || '' });
    });
    details.append(summary, diffButton, make('pre', 'tool-output diff-output', `--- 修改前\n${diff.oldText || ''}\n+++ 修改后\n${diff.newText || ''}`));
    card.appendChild(details);
  }
  addDetail(card, '工具输出', textBlocks(tool?.content));
  addDetail(card, '原始结果', tool?.rawOutput);
}

function renderEntry(entry) {
  if (entry.type === 'user') {
    const row = make('article', 'message user-message');
    row.appendChild(make('div', 'user-bubble', entry.text));
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
    summary.append(make('span', 'thought-spinner'), make('span', '', entry.streaming ? '正在思考…' : '思考过程'));
    const body = make('div', 'thought-body');
    if (entry.text) renderMarkdown(body, entry.text);
    else body.appendChild(make('span', 'thought-placeholder', '等待 Harness 返回思考内容…'));
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
    title.append(make('strong', '', entry.title || entry.kind || '工具调用'), make('span', '', entry.status || 'pending'));
    header.appendChild(title);
    header.addEventListener('click', (event) => {
      event.preventDefault();
      const expanded = !card.open;
      entry.expanded = expanded;
      card.open = expanded;
      if (expanded) {
        userPausedFollow = true;
        followOutput = false;
        lastScrollY = window.scrollY;
      }
      persist();
    });
    card.appendChild(header);
    addToolInformation(card, entry);
    return card;
  }
  if (entry.type === 'plan') {
    const card = make('section', 'plan-card');
    card.appendChild(make('h3', '', '执行计划'));
    for (const item of entry.entries || []) {
      const row = make('div', `plan-entry ${item.status || 'pending'}`);
      const mark = item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '●' : '○';
      row.append(make('span', 'plan-mark', mark), make('span', '', item.content || ''));
      card.appendChild(row);
    }
    return card;
  }
  if (entry.type === 'permission') {
    const card = make('details', `permission-card${entry.resolved ? ' resolved' : ''}`);
    card.open = !entry.resolved;
    const summary = make('summary', 'permission-summary');
    const heading = make('div', 'permission-heading');
    heading.append(
      make('span', 'permission-kicker', entry.resolved ? '审核完成' : '需要人工确认'),
      make('strong', '', entry.toolCall?.title || 'Harness 请求执行操作'),
    );
    summary.appendChild(heading);
    if (entry.resolved) summary.appendChild(make('span', 'permission-result', `已选择：${entry.selected}`));
    const body = make('div', 'permission-body');
    addToolInformation(body, entry.toolCall, true);
    const actions = make('div', 'permission-actions');
    for (const option of entry.options || []) {
      const button = make('button', `permission-option ${option.kind || ''}`, option.name);
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
    card.append(make('strong', '', '出现问题'), make('span', '', entry.message));
    return card;
  }
  if (entry.type === 'notice') return make('div', 'notice', entry.message);
  return make('div', 'notice', printable(entry));
}

function renderHistory() {
  sessionList.replaceChildren();
  const ordered = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const item of ordered) {
    const row = make('div', `session-item${item.id === activeConversationId ? ' active' : ''}`);
    const button = make('button', 'session-open');
    const name = make('span', 'session-name', item.title);
    const meta = make('span', 'session-meta', new Date(item.updatedAt).toLocaleString());
    button.append(name, meta);
    if (item.unread) row.appendChild(make('i', 'unread-dot'));
    button.addEventListener('click', () => selectConversation(item.id));
    const remove = make('button', 'session-delete', '×');
    remove.title = '删除此对话记录';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteConversation(item.id);
    });
    row.append(button, remove);
    sessionList.appendChild(row);
  }
  historyDot.hidden = !conversations.some((item) => item.id !== activeConversationId && item.unread);
}

function deleteConversation(id) {
  conversations = conversations.filter((item) => item.id !== id);
  if (activeConversationId === id) activeConversationId = conversations.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id;
  ensureConversation();
  render();
  persist(true);
  vscode.postMessage({ type: 'switchConversation', conversationId: activeConversationId });
}

function clearConversationHistory() {
  if (!globalThis.confirm('删除插件保存的全部本地对话记录？此操作无法撤销。')) return;
  conversations = [];
  activeConversationId = undefined;
  ensureConversation();
  sessionPanel.hidden = true;
  render();
  persist(true);
  vscode.postMessage({ type: 'switchConversation', conversationId: activeConversationId });
}

function nearBottom(threshold = 12) {
  const root = document.documentElement;
  return root.scrollHeight - (window.scrollY + window.innerHeight) <= threshold;
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

function render(forceScroll = false) {
  if (forceScroll) {
    userPausedFollow = false;
    followOutput = true;
  }
  const shouldFollow = forceScroll || (!userPausedFollow && followOutput);
  const scrollYBeforeRender = window.scrollY;
  const epoch = ++renderEpoch;
  programmaticScroll = true;
  const item = current();
  for (const node of [...conversation.children]) if (node.id !== 'welcome') node.remove();
  welcome.hidden = item.entries.length > 0;
  for (const entry of item.entries) {
    const node = renderEntry(entry);
    if (node) conversation.appendChild(node);
  }
  conversationTitle.value = item.title;
  renderUsage(item);
  renderSessionControls(item);
  activeTurn = item.activeTurn;
  const busy = activeTurn || compactActive;
  send.hidden = compactActive;
  cancel.hidden = !busy;
  compact.disabled = busy || !status.classList.contains('connected');
  input.disabled = compactActive;
  send.disabled = !status.classList.contains('connected') || compactActive;
  send.title = activeTurn ? '追加引导' : '发送';
  send.setAttribute('aria-label', send.title);
  send.classList.toggle('steer-button', activeTurn);
  if (activeTurn) composerHint.textContent = '思考中 · 输入内容可追加引导';
  renderHistory();
  persist();
  requestAnimationFrame(() => {
    if (epoch !== renderEpoch) return;
    if (shouldFollow && !userPausedFollow) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
      followOutput = true;
    } else {
      window.scrollTo({ top: scrollYBeforeRender, behavior: 'auto' });
    }
    requestAnimationFrame(() => {
      if (epoch !== renderEpoch) return;
      lastScrollY = window.scrollY;
      programmaticScroll = false;
    });
  });
}

function closeStreams(item) {
  for (const entry of item.entries) if (entry.type === 'assistant' || entry.type === 'thought') entry.streaming = false;
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
  if (update.content?.type === 'text') target.text += update.content.text;
}

function updateTool(item, update, isNew) {
  let tool = item.entries.find((entry) => entry.type === 'tool' && entry.toolCallId === update.toolCallId);
  if (!tool) {
    tool = { type: 'tool', toolCallId: update.toolCallId };
    item.entries.push(tool);
  }
  for (const key of ['title', 'kind', 'status', 'content', 'rawInput', 'rawOutput', 'locations']) {
    if (update[key] !== undefined && update[key] !== null) tool[key] = update[key];
  }
  for (const permission of item.entries.filter((entry) => entry.type === 'permission' && entry.toolCall?.toolCallId === update.toolCallId)) {
    permission.toolCall = { ...permission.toolCall, ...tool };
  }
  if (isNew && !tool.status) tool.status = 'pending';
}

function handleUpdate(conversationId, update) {
  if (!update?.sessionUpdate) return;
  const item = ensureConversation(conversationId);
  switch (update.sessionUpdate) {
    case 'agent_message_chunk': appendChunk(item, 'assistant', update); break;
    case 'agent_thought_chunk': appendChunk(item, 'thought', update); break;
    case 'tool_call': closeStreams(item); updateTool(item, update, true); break;
    case 'tool_call_update': updateTool(item, update, false); break;
    case 'plan': item.entries.push({ type: 'plan', entries: update.entries || [] }); break;
    case 'usage_update':
      if (update._meta?.rrmaUsage) addUsage(item, update._meta.rrmaUsage);
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
  item.updatedAt = Date.now();
  if (item.id !== activeConversationId) item.unread = true;
  render();
}

function setConnection(stateName, message) {
  status.className = `status ${stateName}`;
  status.querySelector('span').textContent = message || stateName;
  send.disabled = stateName !== 'connected' || compactActive;
  compact.disabled = stateName !== 'connected' || activeTurn || compactActive;
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
  usagePanel.hidden = true;
  usageButton.setAttribute('aria-expanded', 'false');
  composerHint.textContent = 'Enter 发送 · Shift+Enter 换行';
  render();
  vscode.postMessage({ type: 'switchConversation', conversationId: id, sessionId: item.sessionId });
}

function createConversation() {
  const item = normalizeConversation({ id: uid(), title: '新对话' });
  conversations.push(item);
  activeConversationId = item.id;
  sessionPanel.hidden = true;
  render();
  vscode.postMessage({ type: 'newSession', conversationId: item.id });
  input.focus();
}

function submit() {
  const text = input.value.trim();
  if (!text || compactActive) return;
  const item = current();
  if (item.title === '新对话') item.title = text.replace(/\s+/g, ' ').slice(0, 36) || '新对话';
  input.value = '';
  resizeInput();
  render(true);
  vscode.postMessage({ type: activeTurn ? 'steer' : 'send', conversationId: item.id, text });
}

function resizeInput() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
}

send.addEventListener('click', submit);
cancel.addEventListener('click', () => vscode.postMessage({ type: 'cancel', conversationId: activeConversationId }));
compact.addEventListener('click', () => vscode.postMessage({ type: 'compact', conversationId: activeConversationId }));
newSession.addEventListener('click', createConversation);
settings.addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
usageButton.addEventListener('click', () => {
  usagePanel.hidden = !usagePanel.hidden;
  usageButton.setAttribute('aria-expanded', String(!usagePanel.hidden));
});
history.addEventListener('click', () => { sessionPanel.hidden = !sessionPanel.hidden; renderHistory(); });
closeHistory.addEventListener('click', () => { sessionPanel.hidden = true; });
clearHistory.addEventListener('click', clearConversationHistory);
conversationTitle.addEventListener('change', () => {
  current().title = conversationTitle.value.trim() || '新对话';
  current().updatedAt = Date.now();
  render();
});
conversationTitle.addEventListener('keydown', (event) => { if (event.key === 'Enter') conversationTitle.blur(); });
approvalMode.addEventListener('change', () => {
  vscode.postMessage({ type: 'setApprovalMode', value: approvalMode.value });
});
thoughtDisplay.addEventListener('change', () => {
  vscode.postMessage({ type: 'setThoughtDisplay', value: thoughtDisplay.value });
  render();
});
conversation.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-external-url]');
  if (!link) return;
  event.preventDefault();
  vscode.postMessage({ type: 'openExternal', url: link.dataset.externalUrl });
});
document.addEventListener('click', (event) => {
  if (usagePanel.hidden || event.target.closest('#usageButton') || event.target.closest('#usagePanel')) return;
  usagePanel.hidden = true;
  usageButton.setAttribute('aria-expanded', 'false');
});
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '0'].includes(event.key)) event.preventDefault();
});
input.addEventListener('input', resizeInput);
window.addEventListener('wheel', (event) => {
  if (event.ctrlKey) {
    event.preventDefault();
    return;
  }
  if (event.deltaY < 0) {
    userPausedFollow = true;
    followOutput = false;
  }
}, { passive: false });
window.addEventListener('scroll', () => {
  const nextScrollY = window.scrollY;
  if (programmaticScroll) {
    lastScrollY = nextScrollY;
    return;
  }
  if (nextScrollY < lastScrollY - 1) {
    userPausedFollow = true;
    followOutput = false;
  } else if (userPausedFollow && nextScrollY > lastScrollY && nearBottom()) {
    userPausedFollow = false;
    followOutput = true;
  } else if (!userPausedFollow) {
    followOutput = nearBottom(24);
  }
  lastScrollY = nextScrollY;
}, { passive: true });
input.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !fileSuggestions.hidden) {
    event.preventDefault();
    fileSuggestions.hidden = true;
    return;
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submit();
  }
});

function updateFileSuggestions() {
  clearTimeout(fileSuggestTimer);
  const caret = input.selectionStart;
  const prefix = input.value.slice(0, caret);
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
      modelLabel.textContent = data.model || 'DeepSeek';
      workspaceBar.textContent = data.cwd || '';
      workspaceBar.title = `配置：${data.configRoot || ''}`;
      approvalMode.value = data.approvalMode || 'manual';
      thoughtDisplay.value = data.thoughtDisplay || 'collapsed';
      runtimeId = data.runtimeId;
      if (!configured && data.savedState?.conversations?.length) {
        conversations = data.savedState.conversations.map(normalizeConversation);
        activeConversationId = data.savedState.activeConversationId || conversations[0]?.id;
      }
      configured = true;
      render();
      break;
    }
    case 'connection': setConnection(data.state, data.message); break;
    case 'session':
      item.sessionId = data.sessionId;
      item.runtimeId = data.runtimeId;
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
      item.entries.push({ type: 'user', text: data.text });
      item.updatedAt = Date.now();
      render();
      break;
    case 'sessionUpdate': handleUpdate(data.conversationId, data.update); break;
    case 'permission': {
      const cached = item.entries.find((entry) => entry.type === 'tool' && entry.toolCallId === data.toolCall?.toolCallId);
      item.entries.push({ type: 'permission', ...data, toolCall: { ...(cached || {}), ...(data.toolCall || {}) } });
      item.updatedAt = Date.now();
      if (item.id !== activeConversationId) item.unread = true;
      render();
      break;
    }
    case 'turnState':
      item.activeTurn = Boolean(data.active);
      if (data.active && ![...item.entries].reverse().some((entry) => entry.type === 'thought' && entry.streaming)) {
        item.entries.push({ type: 'thought', key: 'thought-current', text: '', streaming: true });
      }
      if (!data.active) closeStreams(item);
      render();
      if (!data.active && item.id === activeConversationId) input.focus();
      break;
    case 'turnComplete':
      closeStreams(item);
      if (data.usage?.totalTokens && item.id === activeConversationId) composerHint.textContent = `本轮 ${data.usage.totalTokens.toLocaleString()} tokens`;
      render();
      break;
    case 'compactState':
      compactActive = Boolean(data.active) && item.id === activeConversationId;
      if (data.active) composerHint.textContent = '正在压缩较早的对话上下文…';
      render();
      break;
    case 'connectionNotice': item.entries.push({ type: 'notice', message: data.message }); render(); break;
    case 'restoreInput':
      if (data.conversationId === activeConversationId && !input.value) {
        input.value = data.text || '';
        resizeInput();
      }
      break;
    case 'error': closeStreams(item); item.entries.push({ type: 'error', message: data.message }); render(); break;
    case 'runtimeReset':
      runtimeId = data.runtimeId;
      if (data.approvalMode) approvalMode.value = data.approvalMode;
      for (const candidate of conversations) {
        candidate.sessionId = undefined;
        candidate.runtimeId = undefined;
        candidate.activeTurn = false;
      }
      current().entries.push({ type: 'notice', message: '权限模式已切换，Harness 运行时已重启。当前界面记录仍保留。' });
      render();
      break;
    case 'approvalModeRejected': approvalMode.value = data.value || 'manual'; break;
    case 'thoughtDisplayChanged': thoughtDisplay.value = data.value; render(); break;
    default: break;
  }
});

render();
setConnection('connecting', '正在连接');
vscode.postMessage({ type: 'ready', conversationId: activeConversationId, state: { conversations, activeConversationId, runtimeId, savedAt: tokenCount(saved.savedAt) } });
