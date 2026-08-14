'use strict';

const vscode = require('vscode');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { AcpTransport } = require('./src/acpTransport');
const { normalizeApprovalMode, normalizeAutoAllowTools, redactSecrets, SecretRedactingBuffer } = require('./src/security');

const TURN_STALL_MS = 90_000;
const CANCEL_ESCALATION_MS = 6_000;
const MAX_DIFF_TEXT_BYTES = 2 * 1024 * 1024;
const DEFAULT_CONFIG_ROOT = path.join(os.homedir(), '.deepseek-harness-vscode');
const LEGACY_CONFIG_ROOT = path.join(os.homedir(), '.rrma-deepseek-harness');

function resolveDefaultConfigRoot() {
  if (fs.existsSync(DEFAULT_CONFIG_ROOT)) return DEFAULT_CONFIG_ROOT;
  if (fs.existsSync(LEGACY_CONFIG_ROOT)) return LEGACY_CONFIG_ROOT;
  return DEFAULT_CONFIG_ROOT;
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
      updatedAt: Number.isFinite(item.updatedAt) ? Number(item.updatedAt) : Date.now(),
      sessionId: boundedString(item.sessionId, '', 256) || undefined,
      runtimeId: boundedString(item.runtimeId, '', 256) || undefined,
      activeTurn: item.activeTurn === true,
      usage: safeUsage(item.usage),
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
    this.turnActivityTimers = new Map();
    this.cancelEscalationTimers = new Map();
    this.stderrBuffer = undefined;
    this.sessionControls = new Map();
    this.pendingInputText = '';
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
      'RRMA DeepseekHarness',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [mediaRoot],
      },
    );
    this.panel.title = 'RRMA DeepseekHarness';
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
      case 'newSession':
        await this.switchConversation(String(message.conversationId || crypto.randomUUID()), true);
        break;
      case 'switchConversation':
        await this.switchConversation(String(message.conversationId || ''), false, boundedString(message.sessionId, '', 256) || undefined);
        break;
      case 'compact':
        await this.compactConversation(String(message.conversationId || this.activeConversationId || ''));
        break;
      case 'cancel':
        this.cancelTurn(String(message.conversationId || this.activeConversationId || ''));
        break;
      case 'permissionResponse':
        this.resolvePermission(message.requestId, message.optionId);
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
      case 'openSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:rrma.rrma-deepseek-harness');
        break;
      case 'setApprovalMode':
        await this.setApprovalMode(String(message.value || 'manual'));
        break;
      case 'setThoughtDisplay':
        await this.setThoughtDisplay(String(message.value || 'collapsed'));
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
    return {
      model: config.get('modelLabel', 'DeepSeek V4 Pro'),
      cwd: this.resolveWorkingDirectory(config),
      configRoot: this.resolveConfigRoot(config),
      approvalMode: normalizeApprovalMode(this.secureSetting(config, 'approvalMode', 'manual')),
      autoAllowTools: normalizeAutoAllowTools(this.secureSetting(config, 'autoAllowTools', [])),
      thoughtDisplay: config.get('thoughtDisplay', 'collapsed'),
      runtimeId: this.runtimeId,
    };
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
      await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:rrma.rrma-deepseek-harness');
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
        await this.showSetupHelp(`${label} 不存在：${target}`);
        return false;
      }
    }

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
        this.sessionIds.clear();
        this.localByBackend.clear();
        this.post({ type: 'connection', state: 'error', message: redactSecrets(error.message) });
      }
    });
    this.transport.start();

    try {
      const initialized = await this.transport.request('initialize', {
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: 'rrma-deepseek-harness-vscode', version: this.context.extension.packageJSON.version },
      });
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
    }
  }

  async steerConversation(text, conversationId) {
    const prompt = text.trim();
    if (!prompt || !conversationId || !this.turnsInProgress.has(conversationId)) return;
    const sessionId = this.sessionIds.get(conversationId);
    if (!this.transport || !sessionId) return;
    try {
      await this.transport.request('rrma.dev/session/steer', { sessionId, text: prompt });
      this.post({ type: 'userMessage', conversationId, text: prompt, steering: true });
      this.post({ type: 'connectionNotice', conversationId, message: '补充引导已加入当前任务，将在下一步生效。' });
    } catch (error) {
      this.post({ type: 'restoreInput', conversationId, text: prompt });
      this.reportError(error, conversationId);
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
    }
  }

  handleNotification(method, params) {
    if (method === 'session/update') {
      const conversationId = this.localByBackend.get(params?.sessionId) || this.activeConversationId;
      if (conversationId && this.turnsInProgress.has(conversationId)) this.scheduleTurnStallCheck(conversationId);
      const update = params?.update;
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
        this.toolCalls.set(key, { ...previous, ...update });
      }
      this.post({ type: 'sessionUpdate', conversationId, update });
      return;
    }
    this.output.appendLine(`[notification] ${method} ${redactSecrets(JSON.stringify(params || {}))}`);
  }

  handleAgentRequest(method, params) {
    if (method !== 'session/request_permission') {
      const error = new Error(`Unsupported client method: ${method}`);
      error.code = -32601;
      throw error;
    }
    const requestId = crypto.randomUUID();
    const conversationId = this.localByBackend.get(params?.sessionId) || this.activeConversationId;
    const toolCallId = params?.toolCall?.toolCallId;
    const cached = conversationId && toolCallId ? this.toolCalls.get(`${conversationId}:${toolCallId}`) : undefined;
    const toolCall = { ...(cached || {}), ...(params?.toolCall || {}) };
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

  cancelTurn(conversationId = this.activeConversationId) {
    const sessionId = this.sessionIds.get(conversationId);
    if (!this.transport || !sessionId || !this.turnsInProgress.has(conversationId)) {
      this.post({ type: 'turnState', conversationId, active: false });
      return;
    }
    this.transport.notify('session/cancel', { sessionId });
    const previous = this.cancelEscalationTimers.get(conversationId);
    if (previous) clearTimeout(previous);
    const transport = this.transport;
    this.cancelEscalationTimers.set(conversationId, setTimeout(() => {
      this.cancelEscalationTimers.delete(conversationId);
      if (this.transport !== transport || !this.turnsInProgress.has(conversationId)) return;
      void this.offerForceRestart(conversationId, 'Harness 没有响应停止请求。');
    }, CANCEL_ESCALATION_MS));
    for (const [id, pending] of this.pendingPermissions) {
      if (pending.conversationId !== conversationId) continue;
      pending.resolve({ outcome: { outcome: 'cancelled' } });
      this.pendingPermissions.delete(id);
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
    this.post({ type: 'turnState', conversationId, active: false });
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
      '**/{.git,node_modules,dist,build,.deepseek,.deepseek-harness-vscode,.rrma-deepseek-harness,.dsh,.sessions}/**',
      500,
    );
    const files = uris
      .map((uri) => vscode.workspace.asRelativePath(uri, false).replaceAll('\\', '/'))
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
    await vscode.commands.executeCommand('vscode.diff', left, right, `RRMA DeepseekHarness · ${label}`, { preview: true });
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
        { modal: true, detail: '这是超危险模式。仅在完全可信的工作区、且使用者明确愿意承担风险时使用。' },
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

  async setThoughtDisplay(value) {
    const allowed = new Set(['expanded', 'collapsed', 'hidden']);
    if (!allowed.has(value)) return;
    await vscode.workspace.getConfiguration('deepseekHarness').update('thoughtDisplay', value, vscode.ConfigurationTarget.Global);
    this.post({ type: 'thoughtDisplayChanged', value });
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
    this.sessionIds.clear();
    this.localByBackend.clear();
    this.toolCalls.clear();
    this.sessionControls.clear();
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

  getHtml(webview) {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'style.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.js'));
    const nonce = crypto.randomBytes(16).toString('hex');
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
  <link rel="stylesheet" href="${styleUri}">
  <title>RRMA DeepseekHarness</title>
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark">DS</span>
      <div><strong>RRMA DeepseekHarness</strong><span id="modelLabel">DeepSeek V4 Pro</span></div>
    </div>
    <div class="conversation-identity">
      <button id="history" class="icon-button history-button" title="所有对话">☰<i id="historyDot" class="unread-dot" hidden></i></button>
      <input id="conversationTitle" class="conversation-title" value="新对话" aria-label="当前对话名称" title="点击修改对话名称">
    </div>
    <div class="top-actions">
      <span id="status" class="status connecting"><i></i><span>正在连接</span></span>
      <select id="thoughtDisplay" class="compact-select" title="思考内容显示方式">
        <option value="expanded">思考：展开</option>
        <option value="collapsed">思考：折叠</option>
        <option value="hidden">思考：隐藏</option>
      </select>
      <button id="newSession" class="icon-button" title="新建对话">＋</button>
      <button id="settings" class="icon-button" title="设置">⚙</button>
    </div>
  </header>
  <aside id="sessionPanel" class="session-panel" hidden>
    <div class="session-panel-header"><strong>所有对话</strong><div><button id="clearHistory" class="text-button" title="删除所有本地对话记录">清空</button><button id="closeHistory" class="icon-button" title="关闭">×</button></div></div>
    <div id="sessionList" class="session-list"></div>
  </aside>
  <div id="workspaceBar" class="workspace-bar"></div>
  <section id="sessionControls" class="session-controls" hidden></section>
  <main id="conversation" aria-live="polite">
    <section id="welcome" class="welcome">
      <div class="welcome-mark">DS</div>
      <h1>RRMA DeepseekHarness</h1>
      <p>通过 ACP 在当前 VS Code 工作区中协作。</p>
    </section>
  </main>
  <footer class="composer-shell">
    <div class="composer">
      <div id="fileSuggestions" class="file-suggestions" hidden></div>
      <textarea id="input" rows="1" placeholder="向 DeepSeek Harness 提出任务…"></textarea>
      <div class="composer-bottom">
        <div class="composer-left">
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
              <div class="usage-cost-total"><dt>Estimated cost</dt><dd id="usageCost">¥0.000000</dd></div>
            </dl>
            <p id="usageCostBreakdown"></p>
            <div class="usage-panel-actions">
              <button id="compact" class="compact-button" type="button" title="压缩较早的对话上下文（可能调用摘要模型并产生费用）">Compact 对话</button>
            </div>
            <p>仅在打开这里时显示费用。按当前官方 V4 Pro 单价估算：缓存命中 ¥0.025/M、未命中 ¥3/M、输出 ¥6/M；实际账单以 DeepSeek 为准。</p>
          </section>
        </div>
        <select id="approvalMode" class="approval-select" title="工具审核方式">
          <option value="manual">全部手动审核</option>
          <option value="sandbox">沙盒内自动，越界询问</option>
          <option value="full-access">全部放行（超危险！）</option>
        </select>
        <button id="cancel" class="cancel-button" title="停止" hidden>■</button>
        <button id="send" class="send-button" title="发送">↑</button>
      </div>
    </div>
  </footer>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function activate(context) {
  const output = vscode.window.createOutputChannel('RRMA DeepseekHarness');
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
