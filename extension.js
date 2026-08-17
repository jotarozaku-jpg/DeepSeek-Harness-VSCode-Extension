'use strict';

const vscode = require('vscode');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { AcpTransport } = require('./src/acpTransport');
const { normalizeApprovalMode, normalizeAutoAllowTools, isSensitiveWorkspacePath, redactSecrets, SecretRedactingBuffer } = require('./src/security');
const { normalizeLocale, translate } = require('./media/i18n');

const TURN_STALL_MS = 90_000;
const CANCEL_ESCALATION_MS = 6_000;
const MAX_DIFF_TEXT_BYTES = 2 * 1024 * 1024;
const DEFAULT_CONFIG_ROOT = path.join(os.homedir(), '.deepseek-harness-vscode');
const OPTIONAL_FEATURE_GROUPS = Object.freeze([
  {
    id: 'skills',
    label: 'Skills',
    description: '发现并调用配置目录中的自定义 Skills。',
    pluginIds: ['skill', 'skill-filesystem', 'tool-skill'],
  },
  {
    id: 'subagents',
    label: 'Subagent',
    description: '允许主 Agent 创建、派生和管理子 Agent。',
    pluginIds: ['subagent', 'subagent-spawn-in-process', 'subagent-fork-in-process', 'tool-subagent-control', 'tool-subagent-list-agents', 'tool-subagent-report', 'tool-subagent', 'tool-subagent-fork'],
  },
  {
    id: 'workflows',
    label: 'Workflow / Ralph',
    description: '启用工作流执行器和 Ralph 长任务循环。',
    pluginIds: ['workflow-worker-thread', 'tool-workflow', 'tool-ralph'],
  },
  {
    id: 'todo',
    label: 'Todo 与重复提醒',
    description: '启用任务列表工具和重复调用提醒。',
    pluginIds: ['tool-todo', 'repeat-tool-reminder'],
  },
  {
    id: 'compaction',
    label: '上下文压缩',
    description: '启用 Harness 上下文压缩和 Compact 功能。',
    pluginIds: ['compaction-basic'],
  },
]);
const FEATURE_GROUP_IDS = new Set(OPTIONAL_FEATURE_GROUPS.map((item) => item.id));

function resolveDefaultConfigRoot() {
  return DEFAULT_CONFIG_ROOT;
}

function normalizeDisabledFeatureGroups(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((item) => FEATURE_GROUP_IDS.has(item)))];
}

function configuredCordisPlugins(configRoot, disabledGroups = []) {
  const configPath = path.join(configRoot, 'cordis.yml');
  let source = '';
  try { source = fs.readFileSync(configPath, 'utf8'); } catch { return []; }
  const disabled = new Set(normalizeDisabledFeatureGroups(disabledGroups));
  const plugins = [];
  let current;
  for (const line of source.split(/\r?\n/)) {
    const idMatch = line.match(/^- id:\s*['"]?([^'"\s]+)['"]?\s*$/);
    if (idMatch) {
      current = { id: idMatch[1], name: '', source: 'official', groupId: undefined, enabled: true, locked: true };
      const group = OPTIONAL_FEATURE_GROUPS.find((item) => item.pluginIds.includes(current.id));
      if (group) {
        current.groupId = group.id;
        current.enabled = !disabled.has(group.id);
        current.locked = false;
      }
      plugins.push(current);
      continue;
    }
    const nameMatch = current && line.match(/^\s{2}name:\s*(.+?)\s*$/);
    if (!nameMatch) continue;
    current.name = nameMatch[1].replace(/^['"]|['"]$/g, '');
    if (current.name.startsWith('./')) current.source = 'local';
    else if (current.name.startsWith('__') || current.name.startsWith('file:')) current.source = 'runtime';
  }
  return plugins;
}

class DiffContentProvider {
  constructor() {
    this.documents = new Map();
  }

  provideTextDocumentContent(uri) {
    return this.documents.get(uri.query) || '';
  }

  add(label, content) {
    const id = crypto.randomUUID();
    this.documents.set(id, content);
    while (this.documents.size > 40) this.documents.delete(this.documents.keys().next().value);
    const safeLabel = String(label || 'change.txt').replace(/[\\/:*?"<>|]/g, '_').slice(-120) || 'change.txt';
    return vscode.Uri.from({ scheme: 'deepseek-harness-diff', path: `/${safeLabel}`, query: id });
  }
}

const MAX_CONVERSATIONS = 50;
const MAX_ENTRIES_PER_CONVERSATION = 500;
const MAX_ENTRY_BYTES = 128 * 1024;
const MAX_STATE_BYTES = 8 * 1024 * 1024;
const MAX_TOOL_CALL_CACHE = 100;
const MAX_TOOL_CALL_FIELD_BYTES = 32 * 1024;

function boundedString(value, fallback = '', max = 256) {
  return typeof value === 'string' ? value.slice(0, max) : fallback;
}

function safeEntry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  try {
    const json = JSON.stringify(value);
    if (Buffer.byteLength(json, 'utf8') > MAX_ENTRY_BYTES) return undefined;
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

function boundedToolCallField(value) {
  if (typeof value === 'string') {
    const encoded = Buffer.from(value, 'utf8');
    return encoded.length <= MAX_TOOL_CALL_FIELD_BYTES
      ? value
      : `${encoded.subarray(0, MAX_TOOL_CALL_FIELD_BYTES).toString('utf8')}\n[truncated]`;
  }
  try {
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') <= MAX_TOOL_CALL_FIELD_BYTES) return JSON.parse(serialized);
    return {
      truncated: true,
      originalBytes: Buffer.byteLength(serialized, 'utf8'),
      preview: serialized.slice(0, MAX_TOOL_CALL_FIELD_BYTES),
    };
  } catch {
    return '[unserializable tool field]';
  }
}

function safeCachedToolCall(value) {
  const source = value && typeof value === 'object' ? value : {};
  const cached = {};
  for (const key of ['toolCallId', 'title', 'kind', 'status']) {
    if (source[key] !== undefined && source[key] !== null) cached[key] = boundedString(String(source[key]), '', 2048);
  }
  for (const key of ['content', 'rawInput', 'rawOutput', 'locations']) {
    if (source[key] !== undefined && source[key] !== null) cached[key] = boundedToolCallField(source[key]);
  }
  return cached;
}

function safeUsage(value) {
  const source = value && typeof value === 'object' ? value : {};
  const token = (candidate) => {
    const number = Number(candidate);
    return Number.isFinite(number) && number >= 0 ? Math.min(Math.floor(number), Number.MAX_SAFE_INTEGER) : 0;
  };
  return {
    inputTokens: token(source.inputTokens),
    uncachedInputTokens: token(source.uncachedInputTokens),
    outputTokens: token(source.outputTokens),
    cacheReadTokens: token(source.cacheReadTokens),
    cacheWriteTokens: token(source.cacheWriteTokens),
  };
}

function safeContextUsage(value) {
  const used = Number(value?.used);
  const size = Number(value?.size);
  return {
    used: Number.isFinite(used) && used >= 0 ? Math.floor(used) : 0,
    size: Number.isFinite(size) && size > 0 ? Math.floor(size) : 0,
  };
}

function safePerformance(value) {
  const positive = (candidate) => {
    const number = Number(candidate);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  };
  return {
    ttftMs: positive(value?.ttftMs),
    tokensPerSecond: positive(value?.tokensPerSecond),
    durationMs: positive(value?.durationMs),
  };
}

function optionValues(option) {
  const values = [];
  for (const item of Array.isArray(option?.options) ? option.options : []) {
    if (Array.isArray(item?.options)) {
      for (const child of item.options) {
        if (typeof child?.value === 'string') values.push(child.value);
      }
    } else if (typeof item?.value === 'string') {
      values.push(item.value);
    }
  }
  return values;
}

function sanitizeQuestions(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).slice(0, 3).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const id = boundedString(item.id, '', 128);
    const question = boundedString(item.question, '', 2000);
    if (!id || !question || seen.has(id)) return [];
    seen.add(id);
    const options = (Array.isArray(item.options) ? item.options : []).slice(0, 20).flatMap((option) => {
      if (!option || typeof option !== 'object') return [];
      const label = boundedString(option.label, '', 160);
      if (!label) return [];
      const description = boundedString(option.description, '', 1000);
      return [{ label, ...(description ? { description } : {}) }];
    });
    const header = boundedString(item.header, '', 160);
    const detail = boundedString(item.detail, '', 64 * 1024);
    const approve = boundedString(item.intent?.approve, '', 160);
    const intent = item.intent?.kind === 'plan-review' && detail && approve && options.some((option) => option.label === approve)
      ? { kind: 'plan-review', approve }
      : undefined;
    return [{
      id,
      question,
      ...(header ? { header } : {}),
      ...(detail ? { detail } : {}),
      ...(options.length ? { options } : {}),
      multiSelect: item.multiSelect === true,
      ...(intent ? { intent } : {}),
    }];
  });
}

function sanitizeConversationState(value) {
  if (!value || typeof value !== 'object') return { conversations: [], activeConversationId: undefined };
  const source = Array.isArray(value.conversations) ? value.conversations : [];
  const conversations = source.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const id = boundedString(item.id, '', 128);
    if (!id) return [];
    const entries = (Array.isArray(item.entries) ? item.entries : [])
      .slice(-MAX_ENTRIES_PER_CONVERSATION)
      .map(safeEntry)
      .map((entry) => (entry?.type === 'assistant' || entry?.type === 'thought' ? { ...entry, streaming: false } : entry))
      .filter(Boolean);
    return [{
      id,
      title: boundedString(item.title, '新对话', 200) || '新对话',
      entries,
      unread: item.unread === true,
      archived: item.archived === true,
      updatedAt: Number.isFinite(item.updatedAt) ? Number(item.updatedAt) : Date.now(),
      sessionId: boundedString(item.sessionId, '', 256) || undefined,
      runtimeId: boundedString(item.runtimeId, '', 256) || undefined,
      activeTurn: item.activeTurn === true,
      usage: safeUsage(item.usage),
      usageByTier: {
        peak: safeUsage(item.usageByTier?.peak),
        offPeak: safeUsage(item.usageByTier?.offPeak),
      },
      pricingIncomplete: item.pricingIncomplete === true,
      contextUsage: safeContextUsage(item.contextUsage),
      performance: safePerformance(item.performance),
      forkedFrom: boundedString(item.forkedFrom, '', 128) || undefined,
    }];
  }).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS);
  const result = {
    conversations,
    activeConversationId: boundedString(value.activeConversationId, '', 128) || conversations[0]?.id,
    runtimeId: boundedString(value.runtimeId, '', 256) || undefined,
    savedAt: Number.isFinite(value.savedAt) ? Number(value.savedAt) : 0,
  };
  while (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_STATE_BYTES) {
    const target = [...conversations].reverse().find((item) => item.entries.length > 0);
    if (!target) break;
    target.entries.shift();
  }
  return result;
}

class DeepSeekChatController {
  constructor(context, output, diffProvider) {
    this.context = context;
    this.output = output;
    this.diffProvider = diffProvider;
    this.panel = undefined;
    this.transport = undefined;
    this.runtimeId = crypto.randomUUID();
    this.sessionIds = new Map();
    this.localByBackend = new Map();
    this.activeConversationId = undefined;
    this.turnsInProgress = new Set();
    this.toolCalls = new Map();
    this.webviewReady = false;
    this.pendingPermissions = new Map();
    this.pendingQuestions = new Map();
    this.queuedPrompts = new Map();
    this.drainingQueues = new Set();
    this.turnActivityTimers = new Map();
    this.cancelEscalationTimers = new Map();
    this.stderrBuffer = undefined;
    this.sessionControls = new Map();
    this.dashboardRequests = new Set();
    this.pendingInputText = '';
    this.cancelRequested = new Set();
    this.connectionState = 'disconnected';
    this.uiLanguage = normalizeLocale(this.context.globalState.get('deepseekHarness.uiLanguage', 'zh-CN'));
    this.disposables = [];
  }

  open(existingPanel) {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active, false);
      return this.panel;
    }

    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    this.panel = existingPanel || vscode.window.createWebviewPanel(
      'deepseekHarness.chat',
      'DeepSeek Harness',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        // Webview state is persisted separately, so hidden tabs may release their DOM and renderer memory.
        retainContextWhenHidden: false,
        localResourceRoots: [mediaRoot],
      },
    );
    this.panel.title = 'DeepSeek Harness';
    this.panel.iconPath = vscode.Uri.joinPath(mediaRoot, 'icon.svg');
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaRoot],
    };
    this.panel.webview.html = this.getHtml(this.panel.webview);
    this.webviewReady = false;

    this.disposables.push(this.panel.webview.onDidReceiveMessage((message) => {
      void this.handleWebviewMessage(message);
    }));
    this.disposables.push(this.panel.onDidDispose(() => this.disposePanel()));
    return this.panel;
  }

  async handleWebviewMessage(message) {
    switch (message.type) {
      case 'ready':
        this.webviewReady = true;
        {
          const durableState = sanitizeConversationState(this.context.globalState.get('deepseekHarness.conversations'));
          const webviewState = sanitizeConversationState(message.state);
          const selectedState = durableState.conversations.length > 0 && durableState.savedAt >= webviewState.savedAt
            ? durableState
            : webviewState.conversations.length > 0 ? webviewState : durableState;
          const savedState = {
            ...selectedState,
            conversations: selectedState.conversations.map((item) => ({ ...item, activeTurn: false })),
          };
          this.activeConversationId = String(savedState.activeConversationId || message.conversationId || crypto.randomUUID());
          await this.context.globalState.update('deepseekHarness.conversations', savedState);
          this.post({
            type: 'configuration',
            ...this.describeConfiguration(),
            savedState,
          });
          if (this.pendingInputText) {
            this.post({ type: 'insertInput', text: this.pendingInputText });
            this.pendingInputText = '';
          }
          const savedConversation = savedState.conversations.find((item) => item.id === this.activeConversationId);
          await this.startSession(this.activeConversationId, savedConversation?.sessionId);
        }
        break;
      case 'send':
        await this.sendPrompt(String(message.text || ''), String(message.conversationId || this.activeConversationId || ''));
        break;
      case 'steer':
        await this.steerConversation(String(message.text || ''), String(message.conversationId || this.activeConversationId || ''));
        break;
      case 'enqueuePrompt':
        this.enqueuePrompt(String(message.text || ''), String(message.conversationId || this.activeConversationId || ''), boundedString(message.queueId, '', 128));
        break;
      case 'steerQueued':
        await this.steerQueuedPrompts(String(message.text || ''), String(message.conversationId || this.activeConversationId || ''));
        break;
      case 'cancelQueuedPrompt':
        this.cancelQueuedPrompt(String(message.conversationId || this.activeConversationId || ''), boundedString(message.queueId, '', 128));
        break;
      case 'newSession':
        await this.switchConversation(String(message.conversationId || crypto.randomUUID()), true);
        break;
      case 'switchConversation':
        await this.switchConversation(String(message.conversationId || ''), false, boundedString(message.sessionId, '', 256) || undefined);
        break;
      case 'compact':
        await this.compactConversation(String(message.conversationId || this.activeConversationId || ''));
        break;
      case 'clearConversation':
        await this.clearConversation(String(message.conversationId || this.activeConversationId || ''));
        break;
      case 'cancel':
        this.cancelTurn(String(message.conversationId || this.activeConversationId || ''));
        break;
      case 'permissionResponse':
        this.resolvePermission(message.requestId, message.optionId);
        break;
      case 'questionResponse':
        this.resolveQuestion(message.requestId, message.answers);
        break;
      case 'listFiles':
        await this.listWorkspaceFiles(String(message.query || ''), boundedString(message.requestId, '', 128));
        break;
      case 'openDiff':
        await this.openDiff(message);
        break;
      case 'setSessionMode':
        await this.setSessionMode(String(message.conversationId || ''), String(message.modeId || ''));
        break;
      case 'setSessionConfigOption':
        await this.setSessionConfigOption(String(message.conversationId || ''), String(message.configId || ''), message.value);
        break;
      case 'refreshDashboard':
        await this.refreshDashboard(String(message.conversationId || this.activeConversationId || ''));
        break;
      case 'goalAction':
        await this.goalAction(String(message.conversationId || this.activeConversationId || ''), String(message.action || ''));
        break;
      case 'interruptSubagent':
        await this.interruptSubagent(String(message.conversationId || this.activeConversationId || ''), String(message.subagentId || ''));
        break;
      case 'openSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:community.deepseek-harness-vscode');
        break;
      case 'openLogs':
        this.output.show(true);
        break;
      case 'restartRuntime':
        await this.restartRuntime(String(message.conversationId || this.activeConversationId || ''));
        break;
      case 'requestDiagnostics':
        this.post({ type: 'diagnostics', ...this.buildDiagnostics() });
        break;
      case 'copyDiagnostics':
        await this.copyDiagnostics();
        break;
      case 'setApprovalMode':
        await this.setApprovalMode(String(message.value || 'manual'));
        break;
      case 'setAutoAllowRead':
        await this.setAutoAllowRead(message.value === true);
        break;
      case 'setFeatureGroup':
        await this.setFeatureGroup(String(message.groupId || ''), message.enabled === true);
        break;
      case 'openCordisConfig':
        await this.openManagedPath('config');
        break;
      case 'openPluginDirectory':
        await this.openManagedPath('plugins');
        break;
      case 'setThoughtDisplay':
        await this.setThoughtDisplay(String(message.value || 'collapsed'));
        break;
      case 'setUiLanguage':
        this.uiLanguage = normalizeLocale(message.value);
        await this.context.globalState.update('deepseekHarness.uiLanguage', this.uiLanguage);
        this.post({ type: 'uiLanguageChanged', value: this.uiLanguage });
        break;
      case 'saveState':
        await this.context.globalState.update('deepseekHarness.conversations', sanitizeConversationState(message.state));
        break;
      case 'openExternal':
        await this.openExternal(String(message.url || ''));
        break;
      default:
        break;
    }
  }

  describeConfiguration() {
    const config = vscode.workspace.getConfiguration('deepseekHarness');
    const configRoot = this.resolveConfigRoot(config);
    const disabledFeatureGroups = normalizeDisabledFeatureGroups(this.secureSetting(config, 'disabledFeatureGroups', []));
    return {
      model: config.get('modelLabel', 'DeepSeek V4 Pro'),
      cwd: this.resolveWorkingDirectory(config),
      configRoot,
      harnessRoot: this.resolveHarnessRoot(config),
      nodePath: String(this.secureSetting(config, 'nodePath', 'node') || 'node'),
      sessionRoot: String(process.env.DSH_SESSION_ROOT || path.join(os.homedir(), '.dsh', '.sessions')),
      credentialsConfigured: fs.existsSync(path.join(configRoot, '.credentials.yaml')),
      preset: 'Current Cordis configuration',
      reasoningEffort: 'max',
      uiLanguage: this.uiLanguage,
      extensionVersion: String(this.context.extension.packageJSON.version || ''),
      featureGroups: OPTIONAL_FEATURE_GROUPS.map((item) => ({
        id: item.id,
        label: item.label,
        description: item.description,
        pluginCount: item.pluginIds.length,
        enabled: !disabledFeatureGroups.includes(item.id),
      })),
      approvalMode: normalizeApprovalMode(this.secureSetting(config, 'approvalMode', 'manual')),
      autoAllowTools: normalizeAutoAllowTools(this.secureSetting(config, 'autoAllowTools', [])),
      thoughtDisplay: config.get('thoughtDisplay', 'collapsed'),
      runtimeId: this.runtimeId,
    };
  }

  buildDiagnostics() {
    const configuration = this.describeConfiguration();
    const disabledFeatureGroups = configuration.featureGroups.filter((item) => !item.enabled).map((item) => item.id);
    const pluginInventory = configuredCordisPlugins(path.join(this.context.extensionPath, 'adapter'), disabledFeatureGroups);
    let localPluginFiles = [];
    try {
      localPluginFiles = fs.readdirSync(path.join(configuration.configRoot, 'plugins'), { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.(?:mjs|cjs|js)$/i.test(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));
    } catch { /* optional directory */ }
    const checks = [
      ['工作目录', configuration.cwd, configuration.cwd && fs.existsSync(configuration.cwd)],
      ['Harness 目录', configuration.harnessRoot, configuration.harnessRoot && fs.existsSync(configuration.harnessRoot)],
      ['配置目录', configuration.configRoot, configuration.configRoot && fs.existsSync(configuration.configRoot)],
      ['ACP 桥接文件', path.join(configuration.configRoot, 'acp-bridge.mjs'), fs.existsSync(path.join(configuration.configRoot, 'acp-bridge.mjs'))],
      ['Cordis 配置', path.join(configuration.configRoot, 'cordis.yml'), fs.existsSync(path.join(configuration.configRoot, 'cordis.yml'))],
      ['API 凭据', '仅检查是否已配置，不读取内容', configuration.credentialsConfigured],
      ['会话目录', configuration.sessionRoot, fs.existsSync(configuration.sessionRoot)],
    ].map(([label, detail, ok]) => ({ label, detail: String(detail || ''), ok: Boolean(ok) }));
    return {
      configuration,
      connected: this.connectionState === 'connected',
      connectionState: this.connectionState,
      runtimeId: this.runtimeId,
      activeTurns: this.turnsInProgress.size,
      checks,
      pluginInventory,
      localPluginFiles,
    };
  }

  async copyDiagnostics() {
    const data = this.buildDiagnostics();
    const home = os.homedir();
    const hideHome = (value) => String(value || '').replaceAll(home, '%USERPROFILE%');
    const payload = {
      extensionVersion: data.configuration.extensionVersion,
      model: data.configuration.model,
      preset: data.configuration.preset,
      reasoningEffort: data.configuration.reasoningEffort,
      approvalMode: data.configuration.approvalMode,
      autoAllowTools: data.configuration.autoAllowTools,
      featureGroups: data.configuration.featureGroups,
      connected: data.connected,
      connectionState: data.connectionState,
      activeTurns: data.activeTurns,
      runtimeId: data.runtimeId,
      paths: {
        cwd: hideHome(data.configuration.cwd),
        harnessRoot: hideHome(data.configuration.harnessRoot),
        configRoot: hideHome(data.configuration.configRoot),
        sessionRoot: hideHome(data.configuration.sessionRoot),
        nodePath: hideHome(data.configuration.nodePath),
      },
      checks: data.checks.map((item) => ({ ...item, detail: hideHome(item.detail) })),
      plugins: data.pluginInventory,
      localPluginFiles: data.localPluginFiles,
    };
    await vscode.env.clipboard.writeText(JSON.stringify(payload, null, 2));
    void vscode.window.showInformationMessage('已复制脱敏诊断信息，API Key 和凭据内容未被读取。');
  }

  secureSetting(config, key, fallback) {
    const inspected = config.inspect(key);
    return inspected?.globalValue ?? inspected?.defaultValue ?? fallback;
  }

  resolveConfigRoot(config = vscode.workspace.getConfiguration('deepseekHarness')) {
    return String(this.secureSetting(config, 'configRoot', '') || '').trim() || resolveDefaultConfigRoot();
  }

  resolveHarnessRoot(config = vscode.workspace.getConfiguration('deepseekHarness')) {
    return String(this.secureSetting(config, 'harnessRoot', '') || '').trim()
      || path.join(os.homedir(), '.deepseek-harness');
  }

  resolveWorkingDirectory(config = vscode.workspace.getConfiguration('deepseekHarness')) {
    const explicit = String(this.secureSetting(config, 'workingDirectory', '') || '').trim();
    if (explicit) return explicit;
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) return folders[0].uri.fsPath;
    return process.cwd();
  }

  async ensureTransport() {
    if (this.transportStarting) return this.transportStarting;
    if (this.transport) return true;
    this.transportStarting = this.createTransport();
    try {
      return await this.transportStarting;
    } finally {
      this.transportStarting = undefined;
    }
  }

  async openInstallGuide() {
    const guide = path.join(this.context.extensionPath, 'docs', 'INSTALL.md');
    if (!fs.existsSync(guide)) return;
    const document = await vscode.workspace.openTextDocument(guide);
    await vscode.window.showTextDocument(document, { preview: true });
  }

  async showSetupHelp(message) {
    this.post({ type: 'connection', state: 'error', message });
    const choice = await vscode.window.showWarningMessage(message, '打开安装说明', '打开扩展设置');
    if (choice === '打开安装说明') await this.openInstallGuide();
    if (choice === '打开扩展设置') {
      await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:community.deepseek-harness-vscode');
    }
  }

  async createTransport() {
    const config = vscode.workspace.getConfiguration('deepseekHarness');
    const configRoot = this.resolveConfigRoot(config);
    const harnessRoot = this.resolveHarnessRoot(config);
    const cwd = this.resolveWorkingDirectory(config);
    const nodePath = String(this.secureSetting(config, 'nodePath', 'node') || 'node');
    const approvalMode = normalizeApprovalMode(this.secureSetting(config, 'approvalMode', 'manual'));
    const autoAllowTools = normalizeAutoAllowTools(this.secureSetting(config, 'autoAllowTools', []));
    const disabledFeatureGroups = normalizeDisabledFeatureGroups(this.secureSetting(config, 'disabledFeatureGroups', []));
    const disabledPluginIds = OPTIONAL_FEATURE_GROUPS
      .filter((item) => disabledFeatureGroups.includes(item.id))
      .flatMap((item) => item.pluginIds);
    const adapterRoot = path.join(this.context.extensionPath, 'adapter');
    const bridgePath = path.join(adapterRoot, 'acp-bridge.mjs');
    const cordisPath = path.join(adapterRoot, 'cordis.yml');
    const entryPoint = path.join(harnessRoot, 'packages', 'examples', 'acp-demo', 'lib', 'bin.js');
    const credentialPath = path.join(configRoot, '.credentials.yaml');

    const required = [
      [configRoot, '机器本地配置目录'],
      [credentialPath, '机器本地 API Key 配置'],
      [entryPoint, '外部 DeepSeek Harness 运行环境'],
      [bridgePath, 'ACP bridge'],
      [cordisPath, 'Cordis config'],
      [cwd, 'working directory'],
    ];
    for (const [target, label] of required) {
      if (!target || !fs.existsSync(target)) {
        this.connectionState = 'error';
        await this.showSetupHelp(`${label} 不存在：${target}`);
        return false;
      }
    }

    this.connectionState = 'connecting';
    this.post({ type: 'connection', state: 'connecting', message: '正在启动 Harness…' });
    this.transport = new AcpTransport({
      command: nodePath,
      args: [bridgePath],
      cwd,
      env: {
        DSH_HOME: configRoot,
        DSH_HARNESS_ROOT: harnessRoot,
        DSH_CORDIS_CONFIG: cordisPath,
        DSH_PERMISSION_MODE: approvalMode === 'full-access' ? 'danger-full-access' : 'workspace-write',
        DSH_APPROVAL_MODE: approvalMode,
        DSH_AUTO_ALLOW_TOOLS: JSON.stringify(autoAllowTools),
        DSH_DISABLED_PLUGIN_IDS: JSON.stringify(disabledPluginIds),
      },
      onRequest: (method, params) => this.handleAgentRequest(method, params),
    });
    const transport = this.transport;
    const stderrBuffer = new SecretRedactingBuffer((text) => this.output.append(text));
    this.stderrBuffer = stderrBuffer;
    this.transport.on('stderr', (chunk) => stderrBuffer.push(chunk));
    this.transport.on('protocolError', (error) => this.reportError(error));
    this.transport.on('notification', (method, params) => this.handleNotification(method, params));
    this.transport.on('close', (error) => {
      stderrBuffer.flush();
      if (this.stderrBuffer === stderrBuffer) this.stderrBuffer = undefined;
      if (this.transport === transport) {
        this.transport = undefined;
        this.connectionState = 'error';
        this.sessionIds.clear();
        this.localByBackend.clear();
        const stoppedConversations = [...this.turnsInProgress];
        this.turnsInProgress.clear();
        for (const conversationId of stoppedConversations) {
          this.clearTurnTimers(conversationId);
          this.post({ type: 'turnState', conversationId, active: false });
          if (this.cancelRequested.delete(conversationId)) {
            this.post({ type: 'cancelState', conversationId, state: 'stopped' });
          }
        }
        void vscode.commands.executeCommand('setContext', 'deepseekHarness.turnInProgress', false);
        this.post({ type: 'connection', state: 'error', message: redactSecrets(error.message) });
      }
    });
    this.transport.start();

    try {
      const initialized = await this.transport.request('initialize', {
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: 'deepseek-harness-vscode', version: this.context.extension.packageJSON.version },
      });
      this.connectionState = 'connected';
      this.post({
        type: 'connection',
        state: 'connected',
        message: initialized?.agentInfo?.name || 'DeepSeek Harness',
      });
      return true;
    } catch (error) {
      this.reportError(error);
      this.stopTransport();
      return false;
    }
  }

  async startSession(conversationId, resumeSessionId) {
    if (!conversationId) return undefined;
    if (!await this.ensureTransport() || !this.transport) return undefined;
    const existing = this.sessionIds.get(conversationId);
    if (existing) {
      const controls = this.sessionControls.get(conversationId) || {};
      this.post({
        type: 'session', conversationId, sessionId: existing, runtimeId: this.runtimeId,
        modes: controls.modes, configOptions: controls.configOptions,
      });
      void this.refreshDashboard(conversationId);
      return existing;
    }
    const config = vscode.workspace.getConfiguration('deepseekHarness');
    const cwd = this.resolveWorkingDirectory(config);
    try {
      if (resumeSessionId) {
        try {
          const resumed = await this.transport.request('session/resume', { sessionId: resumeSessionId, cwd, mcpServers: [] });
          this.sessionIds.set(conversationId, resumeSessionId);
          this.localByBackend.set(resumeSessionId, conversationId);
          this.post({
            type: 'session', conversationId, sessionId: resumeSessionId, runtimeId: this.runtimeId,
            modes: resumed?.modes, configOptions: resumed?.configOptions, resumed: true,
          });
          this.sessionControls.set(conversationId, { modes: resumed?.modes, configOptions: resumed?.configOptions });
          void this.refreshDashboard(conversationId);
          return resumeSessionId;
        } catch (error) {
          this.output.appendLine(`[resume] ${redactSecrets(error?.message || String(error))}`);
          this.post({ type: 'connectionNotice', conversationId, message: '旧对话内容已恢复，但 Harness 上下文无法接回；继续发送时将使用新的上下文。' });
        }
      }
      const created = await this.transport.request('session/new', { cwd, mcpServers: [] });
      this.sessionIds.set(conversationId, created.sessionId);
      this.localByBackend.set(created.sessionId, conversationId);
      this.post({
        type: 'session',
        conversationId,
        sessionId: created.sessionId,
        runtimeId: this.runtimeId,
        modes: created.modes,
        configOptions: created.configOptions,
      });
      this.sessionControls.set(conversationId, { modes: created.modes, configOptions: created.configOptions });
      void this.refreshDashboard(conversationId);
      return created.sessionId;
    } catch (error) {
      this.reportError(error, conversationId);
      return undefined;
    }
  }

  async switchConversation(conversationId, isNew, resumeSessionId) {
    if (!conversationId) return;
    this.activeConversationId = conversationId;
    const sessionId = await this.startSession(conversationId, resumeSessionId);
    if (sessionId) this.post({ type: 'conversationSelected', conversationId, isNew });
  }

  async clearConversation(conversationId) {
    if (!conversationId) return;
    if (this.turnsInProgress.has(conversationId)) {
      this.post({ type: 'connectionNotice', conversationId, message: '请先停止当前任务，再清空对话上下文。' });
      return;
    }

    const previousSessionId = this.sessionIds.get(conversationId);
    const previousControls = this.sessionControls.get(conversationId);
    this.sessionControls.delete(conversationId);
    this.sessionIds.delete(conversationId);
    const nextSessionId = await this.startSession(conversationId);
    if (!nextSessionId) {
      if (previousSessionId) {
        this.sessionIds.set(conversationId, previousSessionId);
        this.localByBackend.set(previousSessionId, conversationId);
      }
      if (previousControls) this.sessionControls.set(conversationId, previousControls);
      return;
    }

    if (previousSessionId && previousSessionId !== nextSessionId) this.localByBackend.delete(previousSessionId);
    for (const key of [...this.toolCalls.keys()]) {
      if (key.startsWith(`${conversationId}:`)) this.toolCalls.delete(key);
    }
    this.post({ type: 'conversationCleared', conversationId, sessionId: nextSessionId, runtimeId: this.runtimeId });
  }

  async sendPrompt(text, conversationId) {
    const prompt = text.trim();
    if (!prompt || !conversationId || this.turnsInProgress.has(conversationId)) return;
    this.activeConversationId = conversationId;
    const sessionId = await this.startSession(conversationId);
    if (!this.transport || !sessionId) return;

    this.turnsInProgress.add(conversationId);
    this.scheduleTurnStallCheck(conversationId);
    await vscode.commands.executeCommand('setContext', 'deepseekHarness.turnInProgress', true);
    this.post({ type: 'userMessage', conversationId, text: prompt });
    this.post({ type: 'turnState', conversationId, active: true });
    try {
      const result = await this.transport.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: prompt }],
      }, 0);
      this.post({ type: 'turnComplete', conversationId, stopReason: result?.stopReason, usage: result?.usage });
    } catch (error) {
      this.reportError(error, conversationId);
    } finally {
      this.clearTurnTimers(conversationId);
      this.turnsInProgress.delete(conversationId);
      await vscode.commands.executeCommand('setContext', 'deepseekHarness.turnInProgress', this.turnsInProgress.size > 0);
      this.post({ type: 'turnState', conversationId, active: false });
      this.finishCancelState(conversationId);
      if (!this.cancelRequested.has(conversationId)) setTimeout(() => { void this.drainQueuedPrompt(conversationId); }, 0);
    }
  }

  enqueuePrompt(text, conversationId, requestedQueueId) {
    const prompt = text.trim();
    if (!prompt || !conversationId) return;
    const queueId = requestedQueueId || crypto.randomUUID();
    const queue = this.queuedPrompts.get(conversationId) || [];
    if (queue.length >= 20 || Buffer.byteLength(prompt, 'utf8') > 256 * 1024) {
      this.post({ type: 'restoreInput', conversationId, text: prompt });
      this.post({ type: 'connectionNotice', conversationId, message: queue.length >= 20 ? '排队消息已达到 20 条上限。' : '单条排队消息不能超过 256KB。' });
      return;
    }
    queue.push({ id: queueId, text: prompt });
    this.queuedPrompts.set(conversationId, queue);
    this.post({ type: 'queuedPrompt', conversationId, queueId, text: prompt, position: queue.length });
    if (!this.turnsInProgress.has(conversationId)) setTimeout(() => { void this.drainQueuedPrompt(conversationId); }, 0);
  }

  cancelQueuedPrompt(conversationId, queueId) {
    if (!conversationId || !queueId) return;
    const queue = this.queuedPrompts.get(conversationId) || [];
    const next = queue.filter((item) => item.id !== queueId);
    if (next.length) this.queuedPrompts.set(conversationId, next);
    else this.queuedPrompts.delete(conversationId);
    this.post({ type: 'queuedPromptCancelled', conversationId, queueId });
  }

  async drainQueuedPrompt(conversationId) {
    if (!conversationId || this.drainingQueues.has(conversationId) || this.turnsInProgress.has(conversationId) || this.cancelRequested.has(conversationId)) return;
    const queue = this.queuedPrompts.get(conversationId) || [];
    const next = queue.shift();
    if (!next) return;
    if (queue.length) this.queuedPrompts.set(conversationId, queue);
    else this.queuedPrompts.delete(conversationId);
    this.post({ type: 'queuedPromptStarted', conversationId, queueId: next.id });
    this.drainingQueues.add(conversationId);
    try {
      await this.sendPrompt(next.text, conversationId);
    } finally {
      this.drainingQueues.delete(conversationId);
    }
  }

  async steerQueuedPrompts(text, conversationId) {
    const current = text.trim();
    const queue = this.queuedPrompts.get(conversationId) || [];
    const prompts = [...queue.map((item) => item.text), ...(current ? [current] : [])];
    if (!prompts.length) return;
    const combined = prompts.join('\n\n');
    const steered = await this.steerConversation(combined, conversationId);
    if (!steered) {
      if (current) this.post({ type: 'restoreInput', conversationId, text: current });
      return;
    }
    this.queuedPrompts.delete(conversationId);
    this.post({ type: 'queuedPromptsSteering', conversationId, queueIds: queue.map((item) => item.id) });
  }

  async steerConversation(text, conversationId) {
    const prompt = text.trim();
    if (!prompt || !conversationId || !this.turnsInProgress.has(conversationId)) return false;
    const sessionId = this.sessionIds.get(conversationId);
    if (!this.transport || !sessionId) return false;
    try {
      await this.transport.request('deepseek-harness-vscode/session/steer', { sessionId, text: prompt });
      this.post({ type: 'userMessage', conversationId, text: prompt, steering: true });
      this.post({ type: 'connectionNotice', conversationId, message: '补充引导已加入当前任务，将在下一步生效。' });
      return true;
    } catch (error) {
      this.reportError(error, conversationId);
      return false;
    }
  }

  async compactConversation(conversationId) {
    if (!conversationId || this.turnsInProgress.has(conversationId)) return;
    const sessionId = await this.startSession(conversationId);
    if (!this.transport || !sessionId) return;
    const choice = await vscode.window.showWarningMessage(
      'Compact 会调用摘要模型压缩较早的对话内容，因此可能产生 API 费用。是否继续？',
      { modal: true, detail: '压缩完成后，后续请求需要携带的历史会减少；界面中的旧聊天记录不会被删除。' },
      '开始 Compact',
    );
    if (choice !== '开始 Compact') return;
    this.turnsInProgress.add(conversationId);
    this.post({ type: 'compactState', conversationId, active: true });
    try {
      const result = await this.transport.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: '/compact' }],
      }, 0);
    } catch (error) {
      this.reportError(error, conversationId);
    } finally {
      this.turnsInProgress.delete(conversationId);
      this.post({ type: 'compactState', conversationId, active: false });
      this.finishCancelState(conversationId);
    }
  }

  finishCancelState(conversationId) {
    if (!this.cancelRequested.has(conversationId)) return;
    this.cancelRequested.delete(conversationId);
    this.post({ type: 'cancelState', conversationId, state: 'stopped' });
  }

  handleNotification(method, params) {
    if (method === 'session/update') {
      const conversationId = this.localByBackend.get(params?.sessionId) || this.activeConversationId;
      if (conversationId && this.turnsInProgress.has(conversationId)) this.scheduleTurnStallCheck(conversationId);
      const update = params?.update;
      let forwardedUpdate = update;
      if (conversationId && update?.sessionUpdate === 'current_mode_update') {
        const controls = this.sessionControls.get(conversationId) || {};
        this.sessionControls.set(conversationId, {
          ...controls,
          modes: controls.modes ? { ...controls.modes, currentModeId: update.currentModeId } : controls.modes,
        });
      }
      if (conversationId && update?.sessionUpdate === 'config_option_update') {
        const controls = this.sessionControls.get(conversationId) || {};
        this.sessionControls.set(conversationId, { ...controls, configOptions: update.configOptions });
      }
      if (conversationId && (update?.sessionUpdate === 'tool_call' || update?.sessionUpdate === 'tool_call_update')) {
        const key = `${conversationId}:${update.toolCallId}`;
        const previous = this.toolCalls.get(key) || {};
        this.toolCalls.delete(key);
        const cached = safeCachedToolCall({ ...previous, ...update });
        this.toolCalls.set(key, cached);
        while (this.toolCalls.size > MAX_TOOL_CALL_CACHE) this.toolCalls.delete(this.toolCalls.keys().next().value);
        forwardedUpdate = { sessionUpdate: update.sessionUpdate, ...cached };
      }
      this.post({ type: 'sessionUpdate', conversationId, update: forwardedUpdate });
      if (conversationId && update?.sessionUpdate === 'tool_call_update'
        && (update.status === 'completed' || update.status === 'failed')) {
        setTimeout(() => { void this.refreshDashboard(conversationId); }, 0);
      }
      return;
    }
    this.output.appendLine(`[notification] ${method} ${redactSecrets(JSON.stringify(params || {}))}`);
  }

  handleAgentRequest(method, params) {
    if (method === 'deepseek-harness-vscode/session/request_question') {
      const requestId = crypto.randomUUID();
      const conversationId = this.localByBackend.get(params?.sessionId) || this.activeConversationId;
      const questions = sanitizeQuestions(params?.questions);
      if (!questions.length) throw new Error('Harness returned no valid questions');
      return new Promise((resolve) => {
        this.pendingQuestions.set(requestId, { resolve, conversationId, questions });
        this.post({
          type: 'question',
          requestId,
          conversationId,
          questions,
        });
      });
    }
    if (method !== 'session/request_permission') {
      const error = new Error(`Unsupported client method: ${method}`);
      error.code = -32601;
      throw error;
    }
    const requestId = crypto.randomUUID();
    const conversationId = this.localByBackend.get(params?.sessionId) || this.activeConversationId;
    const toolCallId = params?.toolCall?.toolCallId;
    const cached = conversationId && toolCallId ? this.toolCalls.get(`${conversationId}:${toolCallId}`) : undefined;
    const toolCall = safeCachedToolCall({ ...(cached || {}), ...(params?.toolCall || {}) });
    return new Promise((resolve) => {
      this.pendingPermissions.set(requestId, { resolve, conversationId });
      this.post({
        type: 'permission',
        requestId,
        conversationId,
        toolCall,
        options: params?.options || [],
      });
    });
  }

  resolvePermission(requestId, optionId) {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) return;
    this.pendingPermissions.delete(requestId);
    pending.resolve(optionId
      ? { outcome: { outcome: 'selected', optionId } }
      : { outcome: { outcome: 'cancelled' } });
  }

  resolveQuestion(requestId, answers) {
    const pending = this.pendingQuestions.get(requestId);
    if (!pending) return;
    this.pendingQuestions.delete(requestId);
    const questionsById = new Map(pending.questions.map((question) => [question.id, question]));
    const answered = new Set();
    const safeAnswers = Array.isArray(answers) ? answers.slice(0, 3).flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const id = boundedString(item.id, '', 128);
      const question = questionsById.get(id);
      if (!question || answered.has(id)) return [];
      answered.add(id);
      const allowed = new Set((question.options || []).map((option) => option.label));
      const selected = (Array.isArray(item.selected) ? item.selected : [])
        .map((value) => boundedString(value, '', 160))
        .filter((value) => value && allowed.has(value))
        .slice(0, question.multiSelect ? 20 : 1);
      return [{
        id,
        selected,
        ...(typeof item.custom === 'string' && item.custom.trim() ? { custom: boundedString(item.custom.trim(), '', 4000) } : {}),
      }];
    }) : [];
    pending.resolve({ answers: safeAnswers });
  }

  cancelTurn(conversationId = this.activeConversationId) {
    const sessionId = this.sessionIds.get(conversationId);
    if (!this.transport || !sessionId || !this.turnsInProgress.has(conversationId)) {
      this.post({ type: 'turnState', conversationId, active: false });
      return;
    }
    this.cancelRequested.add(conversationId);
    const queued = this.queuedPrompts.get(conversationId) || [];
    this.queuedPrompts.delete(conversationId);
    if (queued.length) this.post({ type: 'queuedPromptsCancelled', conversationId, queueIds: queued.map((item) => item.id), reason: '停止当前任务时已同时取消排队消息。' });
    this.post({ type: 'cancelState', conversationId, state: 'requested' });
    this.transport.notify('session/cancel', { sessionId });
    const previous = this.cancelEscalationTimers.get(conversationId);
    if (previous) clearTimeout(previous);
    const transport = this.transport;
    this.cancelEscalationTimers.set(conversationId, setTimeout(() => {
      this.cancelEscalationTimers.delete(conversationId);
      if (this.transport !== transport || !this.turnsInProgress.has(conversationId)) return;
      this.post({ type: 'cancelState', conversationId, state: 'escalated' });
      void this.offerForceRestart(conversationId, 'Harness 没有响应停止请求。');
    }, CANCEL_ESCALATION_MS));
    for (const [id, pending] of this.pendingPermissions) {
      if (pending.conversationId !== conversationId) continue;
      pending.resolve({ outcome: { outcome: 'cancelled' } });
      this.pendingPermissions.delete(id);
    }
    for (const [id, pending] of this.pendingQuestions) {
      if (pending.conversationId !== conversationId) continue;
      pending.resolve({ answers: [] });
      this.pendingQuestions.delete(id);
      this.post({ type: 'questionCancelled', conversationId, requestId: id });
    }
    this.post({ type: 'connectionNotice', conversationId, message: '正在取消当前任务…' });
  }

  scheduleTurnStallCheck(conversationId) {
    const previous = this.turnActivityTimers.get(conversationId);
    if (previous) clearTimeout(previous);
    this.turnActivityTimers.set(conversationId, setTimeout(() => {
      this.turnActivityTimers.delete(conversationId);
      if (!this.turnsInProgress.has(conversationId)) return;
      void this.offerStalledTurnActions(conversationId);
    }, TURN_STALL_MS));
  }

  clearTurnTimers(conversationId) {
    for (const timers of [this.turnActivityTimers, this.cancelEscalationTimers]) {
      const timer = timers.get(conversationId);
      if (timer) clearTimeout(timer);
      timers.delete(conversationId);
    }
  }

  async offerStalledTurnActions(conversationId) {
    if (!this.turnsInProgress.has(conversationId)) return;
    const choice = await vscode.window.showWarningMessage(
      'DeepSeek Harness 已有 90 秒没有返回思考、文本或工具活动，任务可能卡住。',
      '继续等待', '停止', '强制停止并重连',
    );
    if (!this.turnsInProgress.has(conversationId)) return;
    if (choice === '停止') this.cancelTurn(conversationId);
    else if (choice === '强制停止并重连') await this.forceRestartConversation(conversationId);
    else this.scheduleTurnStallCheck(conversationId);
  }

  async offerForceRestart(conversationId, detail) {
    const choice = await vscode.window.showWarningMessage(
      detail,
      { modal: true, detail: '强制停止会重启本地 Harness 进程，并尝试接回当前会话。已经保存的聊天记录不会删除。' },
      '强制停止并重连',
    );
    if (choice === '强制停止并重连') await this.forceRestartConversation(conversationId);
  }

  async forceRestartConversation(conversationId) {
    const resumeSessionId = this.sessionIds.get(conversationId);
    this.stopTransport();
    this.runtimeId = crypto.randomUUID();
    this.post({ type: 'connectionNotice', conversationId, message: '已强制停止旧运行时，正在重新连接 Harness…' });
    await this.startSession(conversationId, resumeSessionId);
  }

  async newConversation() {
    this.open();
    this.post({ type: 'createConversationRequest' });
  }

  async listWorkspaceFiles(query, requestId) {
    const needle = query.trim().toLowerCase().slice(0, 100);
    const uris = await vscode.workspace.findFiles(
      '**/*',
      '**/{.git,node_modules,dist,build,.deepseek,.dsh,.sessions}/**',
      500,
    );
    const files = uris
      .map((uri) => vscode.workspace.asRelativePath(uri, false).replaceAll('\\', '/'))
      .filter((item) => !isSensitiveWorkspacePath(item))
      .filter((item) => !needle || item.toLowerCase().includes(needle))
      .sort((a, b) => {
        const ai = a.toLowerCase().indexOf(needle);
        const bi = b.toLowerCase().indexOf(needle);
        return ai - bi || a.length - b.length || a.localeCompare(b);
      })
      .slice(0, 80);
    this.post({ type: 'fileSuggestions', requestId, files });
  }

  async openDiff(message) {
    const oldText = typeof message.oldText === 'string' ? message.oldText : '';
    const newText = typeof message.newText === 'string' ? message.newText : '';
    if (Buffer.byteLength(oldText, 'utf8') > MAX_DIFF_TEXT_BYTES || Buffer.byteLength(newText, 'utf8') > MAX_DIFF_TEXT_BYTES) {
      void vscode.window.showWarningMessage('差分内容超过 2MB，已阻止打开。');
      return;
    }
    const label = boundedString(message.path, '文件变更', 512) || '文件变更';
    const left = this.diffProvider.add(`修改前-${path.basename(label)}`, oldText);
    const right = this.diffProvider.add(`修改后-${path.basename(label)}`, newText);
    await vscode.commands.executeCommand('vscode.diff', left, right, `DeepSeek Harness · ${label}`, { preview: true });
  }

  async setSessionMode(conversationId, modeId) {
    if (!conversationId || !modeId || this.turnsInProgress.has(conversationId)) return;
    const sessionId = await this.startSession(conversationId);
    const modes = this.sessionControls.get(conversationId)?.modes;
    if (!this.transport || !sessionId || !modes?.availableModes?.some((mode) => mode.id === modeId)) return;
    try {
      await this.transport.request('session/set_mode', { sessionId, modeId });
      this.sessionControls.set(conversationId, { ...this.sessionControls.get(conversationId), modes: { ...modes, currentModeId: modeId } });
      this.post({ type: 'sessionModeChanged', conversationId, modeId });
    } catch (error) {
      this.reportError(error, conversationId);
    }
  }

  async setSessionConfigOption(conversationId, configId, value) {
    if (!conversationId || !configId || this.turnsInProgress.has(conversationId)) return;
    const sessionId = await this.startSession(conversationId);
    const options = this.sessionControls.get(conversationId)?.configOptions;
    const option = Array.isArray(options) ? options.find((item) => item.id === configId) : undefined;
    if (!this.transport || !sessionId || !option) return;
    const valid = option.type === 'boolean'
      ? typeof value === 'boolean'
      : typeof value === 'string' && optionValues(option).includes(value);
    if (!valid) return;
    try {
      const result = await this.transport.request('session/set_config_option', {
        sessionId, configId, value,
        ...(option.type === 'boolean' ? { type: 'boolean' } : {}),
      });
      const configOptions = Array.isArray(result?.configOptions) ? result.configOptions : options.map((item) => (
        item.id === configId ? { ...item, currentValue: value } : item
      ));
      this.sessionControls.set(conversationId, { ...this.sessionControls.get(conversationId), configOptions });
      this.post({ type: 'sessionConfigChanged', conversationId, configOptions });
    } catch (error) {
      this.reportError(error, conversationId);
    }
  }

  async refreshDashboard(conversationId) {
    if (!conversationId || this.dashboardRequests.has(conversationId)) return;
    const sessionId = this.sessionIds.get(conversationId);
    if (!this.transport || !sessionId) return;
    this.dashboardRequests.add(conversationId);
    try {
      const state = await this.transport.request('deepseek-harness-vscode/session/dashboard', { sessionId }, 10000);
      this.post({ type: 'dashboardState', conversationId, goal: state?.goal ?? null, subagents: state?.subagents ?? [] });
    } catch (error) {
      this.output.appendLine(`[dashboard] ${redactSecrets(error?.message || String(error))}`);
    } finally {
      this.dashboardRequests.delete(conversationId);
    }
  }

  async goalAction(conversationId, action) {
    if (!['pause', 'resume', 'clear'].includes(action)) return;
    const sessionId = this.sessionIds.get(conversationId);
    if (!this.transport || !sessionId) return;
    try {
      const state = await this.transport.request('deepseek-harness-vscode/session/goal_action', { sessionId, action }, 10000);
      this.post({ type: 'dashboardState', conversationId, goal: state?.goal ?? null, subagents: state?.subagents ?? [] });
    } catch (error) {
      this.reportError(error, conversationId);
    }
  }

  async interruptSubagent(conversationId, subagentId) {
    if (!subagentId) return;
    const sessionId = this.sessionIds.get(conversationId);
    if (!this.transport || !sessionId) return;
    try {
      const state = await this.transport.request('deepseek-harness-vscode/session/subagent_interrupt', { sessionId, subagentId }, 10000);
      this.post({ type: 'dashboardState', conversationId, goal: state?.goal ?? null, subagents: state?.subagents ?? [] });
    } catch (error) {
      this.reportError(error, conversationId);
    }
  }

  insertInputText(text) {
    this.open();
    if (this.webviewReady) this.post({ type: 'insertInput', text });
    else this.pendingInputText = text;
  }

  sendEditorSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      void vscode.window.showInformationMessage('请先在编辑器中选择一段内容。');
      return;
    }
    const selected = editor.document.getText(editor.selection);
    if (Buffer.byteLength(selected, 'utf8') > 256 * 1024) {
      void vscode.window.showWarningMessage('选择内容超过 256KB，请缩小范围后再发送。');
      return;
    }
    const file = vscode.workspace.asRelativePath(editor.document.uri, false).replaceAll('\\', '/');
    const start = editor.selection.start.line + 1;
    const end = editor.selection.end.line + 1;
    this.insertInputText(`@${file}:L${start}-L${end}\n\n${selected}`);
  }

  async setApprovalMode(value) {
    const allowed = new Set(['manual', 'sandbox', 'full-access']);
    if (!allowed.has(value)) return;
    if (value === 'full-access') {
      const choice = await vscode.window.showWarningMessage(
        '全部放行会关闭逐次工具审核，并解除文件沙盒边界。DeepSeek 随后可以直接修改整台机器。',
        { modal: true, detail: '这是超危险模式。仅在完全可信的工作区、且你明确愿意承担风险时使用。' },
        '确认全部放行（超危险！）',
      );
      if (choice !== '确认全部放行（超危险！）') {
        const current = normalizeApprovalMode(this.secureSetting(vscode.workspace.getConfiguration('deepseekHarness'), 'approvalMode', 'manual'));
        this.post({ type: 'approvalModeRejected', value: current });
        return;
      }
    }
    await vscode.workspace.getConfiguration('deepseekHarness').update('approvalMode', value, vscode.ConfigurationTarget.Global);
    this.stopTransport();
    this.runtimeId = crypto.randomUUID();
    this.post({ type: 'runtimeReset', approvalMode: value, runtimeId: this.runtimeId });
    if (this.activeConversationId) await this.startSession(this.activeConversationId);
  }

  async setAutoAllowRead(enabled) {
    const config = vscode.workspace.getConfiguration('deepseekHarness');
    await config.update('autoAllowTools', enabled ? ['read'] : [], vscode.ConfigurationTarget.Global);
    const approvalMode = normalizeApprovalMode(this.secureSetting(config, 'approvalMode', 'manual'));
    this.stopTransport();
    this.runtimeId = crypto.randomUUID();
    this.post({
      type: 'runtimeReset',
      approvalMode,
      autoAllowTools: enabled ? ['read'] : [],
      runtimeId: this.runtimeId,
      message: `安全读取自动批准已${enabled ? '开启' : '关闭'}，Harness 运行时已重启。`,
    });
    if (this.activeConversationId) await this.startSession(this.activeConversationId);
  }

  async setFeatureGroup(groupId, enabled) {
    const group = OPTIONAL_FEATURE_GROUPS.find((item) => item.id === groupId);
    if (!group) return;
    const config = vscode.workspace.getConfiguration('deepseekHarness');
    const current = normalizeDisabledFeatureGroups(this.secureSetting(config, 'disabledFeatureGroups', []));
    const currentlyEnabled = !current.includes(groupId);
    if (currentlyEnabled === enabled) return;
    if (!enabled) {
      const choice = await vscode.window.showWarningMessage(
        `关闭“${group.label}”功能组？`,
        { modal: true, detail: `将从下一次 Harness 启动配置中移除 ${group.pluginIds.length} 个相关组件，并创建新的运行时会话。聊天记录不会删除。` },
        '关闭并重启 Harness',
      );
      if (choice !== '关闭并重启 Harness') {
        this.post({ type: 'featureGroupRejected', groupId, enabled: currentlyEnabled });
        return;
      }
    }
    const next = enabled ? current.filter((item) => item !== groupId) : [...current, groupId];
    await config.update('disabledFeatureGroups', normalizeDisabledFeatureGroups(next), vscode.ConfigurationTarget.Global);
    this.stopTransport();
    this.runtimeId = crypto.randomUUID();
    const featureGroups = this.describeConfiguration().featureGroups;
    this.post({
      type: 'runtimeReset',
      runtimeId: this.runtimeId,
      featureGroups,
      message: `“${group.label}”已${enabled ? '开启' : '关闭'}，Harness 运行时已重启并使用新的组件目录。`,
    });
    if (this.activeConversationId) await this.startSession(this.activeConversationId);
    this.post({ type: 'diagnostics', ...this.buildDiagnostics() });
  }

  async openManagedPath(kind) {
    const configRoot = this.resolveConfigRoot();
    const target = kind === 'plugins'
      ? path.join(configRoot, 'plugins')
      : path.join(this.context.extensionPath, 'adapter', 'cordis.yml');
    if (!target || !fs.existsSync(target)) {
      void vscode.window.showWarningMessage(`路径不存在：${target}`);
      return;
    }
    const uri = vscode.Uri.file(target);
    if (kind === 'plugins') await vscode.commands.executeCommand('revealFileInOS', uri);
    else await vscode.window.showTextDocument(uri, { preview: true });
  }

  async setThoughtDisplay(value) {
    const allowed = new Set(['expanded', 'collapsed', 'hidden']);
    if (!allowed.has(value)) return;
    await vscode.workspace.getConfiguration('deepseekHarness').update('thoughtDisplay', value, vscode.ConfigurationTarget.Global);
    this.post({ type: 'thoughtDisplayChanged', value });
  }

  async restartRuntime(conversationId) {
    const detail = this.turnsInProgress.size > 0
      ? '当前仍有任务正在运行。重启会立即中断这些任务，但不会删除已经保存的聊天记录。'
      : '这会重新启动本地 Harness 进程，并为当前对话重新连接会话。聊天记录不会删除。';
    const choice = await vscode.window.showWarningMessage(
      '重新启动 DeepSeek Harness？',
      { modal: true, detail },
      '重启 Harness',
    );
    if (choice !== '重启 Harness') return;
    const resumeSessionId = conversationId ? this.sessionIds.get(conversationId) : undefined;
    this.stopTransport();
    this.runtimeId = crypto.randomUUID();
    this.post({
      type: 'runtimeReset',
      runtimeId: this.runtimeId,
      message: 'Harness 运行时已手动重启，正在恢复当前会话。',
    });
    if (conversationId) await this.startSession(conversationId, resumeSessionId);
    this.post({ type: 'diagnostics', ...this.buildDiagnostics() });
  }

  async openExternal(rawUrl) {
    let uri;
    try {
      uri = vscode.Uri.parse(rawUrl, true);
      if (uri.scheme !== 'https' && uri.scheme !== 'http') throw new Error('unsupported scheme');
    } catch {
      void vscode.window.showWarningMessage('已阻止无效或不安全的外部链接。');
      return;
    }
    const choice = await vscode.window.showWarningMessage(
      `是否在浏览器中打开此链接？\n${uri.toString(true)}`,
      { modal: true },
      '打开链接',
    );
    if (choice === '打开链接') await vscode.env.openExternal(uri);
  }

  reportError(error, conversationId = this.activeConversationId) {
    const message = redactSecrets(error?.message || String(error));
    this.output.appendLine(`[error] ${message}`);
    this.post({ type: 'error', conversationId, message });
  }

  post(message) {
    if (this.panel && this.webviewReady) void this.panel.webview.postMessage(message);
  }

  stopTransport() {
    const transport = this.transport;
    this.transport = undefined;
    this.connectionState = 'disconnected';
    const stoppedConversations = [...this.turnsInProgress];
    this.sessionIds.clear();
    this.localByBackend.clear();
    this.toolCalls.clear();
    this.sessionControls.clear();
    this.dashboardRequests.clear();
    this.turnsInProgress.clear();
    for (const timer of this.turnActivityTimers.values()) clearTimeout(timer);
    for (const timer of this.cancelEscalationTimers.values()) clearTimeout(timer);
    this.turnActivityTimers.clear();
    this.cancelEscalationTimers.clear();
    this.stderrBuffer?.flush();
    this.stderrBuffer = undefined;
    if (transport) transport.stop();
    for (const [id, pending] of this.pendingPermissions) {
      pending.resolve({ outcome: { outcome: 'cancelled' } });
      this.pendingPermissions.delete(id);
    }
    for (const [id, pending] of this.pendingQuestions) {
      pending.resolve({ answers: [] });
      this.pendingQuestions.delete(id);
      this.post({ type: 'questionCancelled', conversationId: pending.conversationId, requestId: id });
    }
    for (const [conversationId, queue] of this.queuedPrompts) {
      this.post({ type: 'queuedPromptsCancelled', conversationId, queueIds: queue.map((item) => item.id), reason: 'Harness 运行时已重置，排队消息没有自动执行。' });
    }
    this.queuedPrompts.clear();
    this.drainingQueues.clear();
    for (const conversationId of stoppedConversations) {
      this.post({ type: 'turnState', conversationId, active: false });
      if (this.cancelRequested.delete(conversationId)) {
        this.post({ type: 'cancelState', conversationId, state: 'stopped' });
      }
    }
    void vscode.commands.executeCommand('setContext', 'deepseekHarness.turnInProgress', false);
  }

  disposePanel() {
    this.stopTransport();
    this.panel = undefined;
    this.webviewReady = false;
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }

  dispose() {
    this.disposePanel();
  }

  t(source) {
    return translate(source, this.uiLanguage);
  }

  getHtml(webview) {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'style.css'));
    const i18nUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'i18n.js'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.js'));
    const nonce = crypto.randomBytes(16).toString('hex');
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>DeepSeek Harness</title>
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark">DS</span>
      <div><strong>DeepSeek Harness</strong><span id="modelLabel">DeepSeek V4 Pro</span></div>
    </div>
    <div class="conversation-identity">
      <button id="history" class="icon-button history-button" title="所有对话">☰<i id="historyDot" class="unread-dot" hidden></i></button>
      <input id="conversationTitle" class="conversation-title" value="新对话" aria-label="当前对话名称" title="点击修改对话名称">
    </div>
    <div class="top-actions">
      <span id="status" class="status connecting"><i></i><span>正在连接</span></span>
      <button id="newSession" class="icon-button" title="新建对话">＋</button>
      <button id="settings" class="icon-button" title="设置与管理" aria-expanded="false">⚙</button>
    </div>
  </header>
  <aside id="sessionPanel" class="session-panel" hidden>
    <div class="session-panel-header"><strong>所有对话</strong><div><button id="closeHistory" class="icon-button" title="关闭">×</button></div></div>
    <div class="session-filter">
      <input id="sessionSearch" type="search" placeholder="搜索标题和内容…" aria-label="搜索对话">
      <label><input id="showArchived" type="checkbox"> 显示归档</label>
    </div>
    <div id="sessionList" class="session-list"></div>
  </aside>
  <div id="settingsOverlay" class="settings-overlay" hidden>
    <section id="settingsPanel" class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
      <header class="settings-panel-header">
        <div><strong id="settingsTitle">设置与管理</strong><span>DeepSeek Harness 运行环境</span></div>
        <button id="closeSettings" class="icon-button" type="button" title="关闭">×</button>
      </header>
      <div class="settings-panel-body">
        <section class="management-section">
          <h2>当前运行</h2>
          <div class="management-grid">
            <div><span>连接状态</span><strong id="managementStatus">正在连接</strong></div>
            <div><span>扩展版本</span><strong id="managementVersion">—</strong></div>
            <div><span>Harness 配置</span><strong id="managementPreset">Current Cordis configuration</strong></div>
            <div><span>推理强度</span><strong id="managementReasoning">Max</strong></div>
            <div><span>模型</span><strong id="managementModel">DeepSeek V4 Pro</strong></div>
            <div><span>API 凭据</span><strong id="managementCredentials">检查中</strong></div>
          </div>
          <p class="settings-note">Harness 配置与权限审核是两套独立设置；当前不提供 Minimal、PTC 或实验预设切换。</p>
        </section>
        <section class="management-section">
          <h2>对话显示与安全</h2>
          <label class="management-field"><span>界面语言</span><select id="uiLanguage" class="approval-select" title="界面语言">
            <option value="zh-CN" data-i18n-skip>中文</option>
            <option value="en" data-i18n-skip>English</option>
            <option value="ja" data-i18n-skip>日本語</option>
          </select></label>
          <label class="management-field"><span>工具审核</span><select id="approvalMode" class="approval-select" title="工具审核方式">
            <option value="manual">全部手动审核</option>
            <option value="sandbox">沙盒内自动，越界询问</option>
            <option value="full-access">全部放行（超危险！）</option>
          </select></label>
          <label class="management-field"><span>安全读取自动批准</span><input id="autoAllowRead" class="management-checkbox" type="checkbox"><small>仅手动模式；限制在工作区内并排除密钥文件</small></label>
          <label class="management-field"><span>思考内容</span><select id="thoughtDisplay" class="approval-select" title="思考内容显示方式">
            <option value="expanded">默认展开</option>
            <option value="collapsed">默认折叠</option>
            <option value="hidden">隐藏</option>
          </select></label>
        </section>
        <section class="management-section">
          <h2>路径与存储</h2>
          <dl class="management-paths">
            <div><dt>工作目录</dt><dd id="managementCwd">—</dd></div>
            <div><dt>Harness</dt><dd id="managementHarnessRoot">—</dd></div>
            <div><dt>配置目录</dt><dd id="managementConfigRoot">—</dd></div>
            <div><dt>Node</dt><dd id="managementNodePath">—</dd></div>
            <div><dt>会话记录</dt><dd id="managementSessionRoot">—</dd></div>
          </dl>
          <button id="openAdvancedSettings" class="management-button" type="button">在 VS Code 中编辑路径设置</button>
        </section>
        <section class="management-section">
          <div class="management-section-heading"><h2>Harness 插件</h2><span id="pluginSummary" class="settings-note">正在读取 Cordis 配置…</span></div>
          <p class="settings-note">核心组件保持锁定；以下开关会按依赖关系成组修改下一次运行时的组件目录。外部代码的安装与删除暂不自动执行。</p>
          <div id="featureGroupList" class="feature-group-list"></div>
          <details class="plugin-inventory-details">
            <summary>查看 Cordis 组件清单</summary>
            <div id="pluginInventory" class="plugin-inventory"></div>
            <div id="localPluginFiles" class="local-plugin-files"></div>
          </details>
          <div class="management-actions horizontal plugin-path-actions">
            <button id="openCordisConfig" class="management-button" type="button">打开 cordis.yml</button>
            <button id="openPluginDirectory" class="management-button" type="button">打开本地插件目录</button>
          </div>
        </section>
        <section class="management-section">
          <h2>对话整理</h2>
          <div class="management-actions">
            <button id="compact" class="management-button" type="button" title="压缩较早的对话上下文（可能调用摘要模型并产生费用）">Compact 当前对话</button>
            <button id="clearConversation" class="management-button" type="button" title="清空当前显示和 Harness 上下文，开始同一对话槽中的新会话">/clear 当前对话</button>
            <button id="clearHistory" class="management-button danger-management-button" type="button" title="删除插件保存的所有本地对话记录">清空全部本地记录</button>
          </div>
        </section>
        <section class="management-section">
          <div class="management-section-heading"><h2>诊断</h2><button id="refreshDiagnostics" class="text-button" type="button">重新检查</button></div>
          <div id="diagnosticList" class="diagnostic-list"><span class="settings-note">打开设置时自动检查。</span></div>
          <div class="management-actions horizontal">
            <button id="openLogs" class="management-button" type="button">打开 Harness 日志</button>
            <button id="copyDiagnostics" class="management-button" type="button">复制脱敏诊断</button>
            <button id="restartRuntime" class="management-button warning-management-button" type="button">重启 Harness</button>
          </div>
        </section>
      </div>
    </section>
  </div>
  <div class="context-header">
    <div id="workspaceBar" class="workspace-bar"></div>
    <section id="sessionControls" class="session-controls" hidden></section>
    <section id="runtimeDashboard" class="runtime-dashboard" hidden>
      <div id="goalBar" class="goal-bar" hidden>
        <span class="dashboard-icon">◇</span>
        <div class="goal-copy"><span>Goal</span><strong id="goalObjective">—</strong></div>
        <span id="goalStatus" class="dashboard-status">—</span>
        <button id="goalToggle" class="dashboard-button" type="button">暂停</button>
        <button id="goalClear" class="dashboard-icon-button" type="button" title="清除 Goal">×</button>
      </div>
      <details id="subagentPanel" class="subagent-panel" hidden>
        <summary><span class="dashboard-icon">◇</span><strong>Subagents</strong><span id="subagentSummary">0</span></summary>
        <div id="subagentList" class="subagent-list"></div>
      </details>
    </section>
  </div>
  <main id="conversation" aria-live="polite">
    <section id="welcome" class="welcome">
      <div class="welcome-mark">DS</div>
      <h1>DeepSeek Harness</h1>
      <p>通过 ACP 在当前 VS Code 工作区中协作。</p>
    </section>
  </main>
  <footer class="composer-shell">
    <div class="composer">
      <div id="fileSuggestions" class="file-suggestions" hidden></div>
      <textarea id="input" rows="1" placeholder="向 DeepSeek Harness 提出任务…"></textarea>
      <div class="composer-bottom">
        <div class="composer-left">
          <button id="contextMeter" class="context-meter" type="button" aria-label="上下文占用" aria-expanded="false" title="上下文占用尚未知"><span id="contextRing" class="context-ring"><i></i></span><span id="contextLabel">Context —</span></button>
          <button id="usageButton" class="usage-button" type="button" aria-expanded="false" title="当前对话 Token 用量">In 0 · Out 0 · Cache —</button>
          <span id="composerHint">Enter 发送 · Shift+Enter 换行</span>
          <section id="usagePanel" class="usage-panel" hidden>
            <div class="usage-panel-title"><strong>当前对话用量与估算费用</strong><span>DeepSeek V4 Pro</span></div>
            <dl>
              <div><dt>Input</dt><dd id="usageInput">0</dd></div>
              <div><dt>Output</dt><dd id="usageOutput">0</dd></div>
              <div><dt>Cache hit rate</dt><dd id="usageCacheRate">—</dd></div>
              <div><dt>Cache hit tokens</dt><dd id="usageCacheRead">0</dd></div>
              <div><dt>Uncached input</dt><dd id="usageUncached">0</dd></div>
              <div><dt>Context</dt><dd id="usageContext">—</dd></div>
              <div><dt>TTFT</dt><dd id="usageTtft">—</dd></div>
              <div><dt>Output speed</dt><dd id="usageThroughput">—</dd></div>
              <div><dt>当前费率</dt><dd id="usagePriceTier">—</dd></div>
              <div class="usage-cost-total"><dt>Estimated cost</dt><dd id="usageCost">$0.000000</dd></div>
            </dl>
            <p id="usageCostBreakdown"></p>
            <p>仅在打开这里时显示费用。按 DeepSeek V4 Pro 当前官方美元单价估算：缓存命中 $0.003625/M、未命中输入 $0.435/M、输出 $0.87/M；实际账单以 DeepSeek 为准。</p>
            <div class="usage-panel-actions">
              <button id="usageCompact" class="management-button" type="button" title="压缩较早的对话上下文">Compact</button>
              <button id="usageClear" class="management-button warning-management-button" type="button" title="清空当前对话并新建 Harness 上下文">/clear</button>
            </div>
          </section>
        </div>
        <label class="composer-approval-wrap" title="工具权限模式">
          <select id="composerApprovalMode" class="composer-approval-select" aria-label="工具权限模式">
            <option value="manual">手动审核</option>
            <option value="sandbox">沙盒自动</option>
            <option value="full-access">全部放行</option>
          </select>
        </label>
        <button id="cancel" class="cancel-button" title="停止" hidden>■</button>
        <button id="send" class="send-button" title="发送">↑</button>
      </div>
    </div>
  </footer>
  <script nonce="${nonce}" src="${i18nUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function activate(context) {
  const output = vscode.window.createOutputChannel('DeepSeek Harness');
  const diffProvider = new DiffContentProvider();
  const controller = new DeepSeekChatController(context, output, diffProvider);
  const openChat = () => controller.open();
  const newConversation = async () => controller.newConversation();

  context.subscriptions.push(output, controller);
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('deepseek-harness-diff', diffProvider));
  context.subscriptions.push(vscode.commands.registerCommand('deepseekHarness.openChat', openChat));
  context.subscriptions.push(vscode.commands.registerCommand('deepseekHarness.newConversation', newConversation));
  context.subscriptions.push(vscode.commands.registerCommand('deepseekHarness.cancelTurn', () => controller.cancelTurn()));
  context.subscriptions.push(vscode.commands.registerCommand('deepseekHarness.sendSelection', () => controller.sendEditorSelection()));
  context.subscriptions.push(vscode.commands.registerCommand('deepseekHarness.openInstallGuide', () => controller.openInstallGuide()));
  context.subscriptions.push(vscode.window.registerWebviewPanelSerializer('deepseekHarness.chat', {
    deserializeWebviewPanel(panel) {
      controller.open(panel);
      return Promise.resolve();
    },
  }));

}

function deactivate() {}

module.exports = { activate, deactivate };
