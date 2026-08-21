(function initDeepSeekHarnessI18n(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DSH_I18N = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const SUPPORTED = new Set(['zh-CN', 'en', 'ja']);
  const EN = {
    '所有对话': 'All conversations', '新对话': 'New conversation', '当前对话名称': 'Current conversation title',
    '点击修改对话名称': 'Click to rename', '正在连接': 'Connecting', '新建对话': 'New conversation',
    '设置与管理': 'Settings & management', '关闭': 'Close', '搜索标题和内容…': 'Search titles and content…',
    '搜索对话': 'Search conversations', '显示归档': 'Show archived', 'DeepSeek Harness 运行环境': 'DeepSeek Harness runtime',
    '当前运行': 'Current runtime', '连接状态': 'Connection', '扩展版本': 'Extension version',
    'Harness 配置': 'Harness preset', '推理强度': 'Reasoning effort', '模型': 'Model', '当前会话模型': 'Current conversation model', 'API 凭据': 'API credentials',
    '检查中': 'Checking', '对话显示与安全': 'Conversation display & safety', '界面语言': 'Interface language',
    '工具审核': 'Tool approval', '工具审核方式': 'Tool approval mode', '全部手动审核': 'Manual approval',
    '沙盒内自动，越界询问': 'Auto in sandbox; ask outside', '全部放行（超危险！）': 'Allow all (extremely dangerous!)',
    '安全读取自动批准': 'Auto-approve safe reads', '仅手动模式；限制在工作区内并排除密钥文件': 'Manual mode only; workspace-limited and excludes credential files',
    '思考内容': 'Reasoning content', '思考内容显示方式': 'Reasoning display', '默认展开': 'Expanded by default',
    '默认折叠': 'Collapsed by default', '隐藏': 'Hidden', '路径与存储': 'Paths & storage',
    '工作目录': 'Working directory', '配置目录': 'Configuration directory', '会话记录': 'Session history',
    '在 VS Code 中编辑路径设置': 'Edit path settings in VS Code', 'Harness 插件': 'Harness plugins',
    '正在读取 Cordis 配置…': 'Reading Cordis configuration…', '查看 Cordis 组件清单': 'View Cordis component inventory',
    '打开 cordis.yml': 'Open cordis.yml', '打开本地插件目录': 'Open local plugin directory', '对话整理': 'Conversation maintenance',
    'Compact 当前对话': 'Compact current conversation', '/clear 当前对话': '/clear current conversation',
    '清空全部本地记录': 'Clear all local history', '诊断': 'Diagnostics', '重新检查': 'Check again',
    '打开设置时自动检查。': 'Checked automatically when settings opens.', '打开 Harness 日志': 'Open Harness logs',
    '复制脱敏诊断': 'Copy redacted diagnostics', '重启 Harness': 'Restart Harness', '暂停': 'Pause', '恢复': 'Resume',
    '清除 Goal': 'Clear goal', '通过 ACP 在当前 VS Code 工作区中协作。': 'Collaborate in the current VS Code workspace through ACP.',
    '向 DeepSeek Harness 提出任务…': 'Ask DeepSeek Harness to work on a task…', '上下文占用': 'Context usage',
    '上下文占用尚未知': 'Context usage is not available yet', '当前对话 Token 用量': 'Current conversation token usage',
    'Enter 发送 · Shift+Enter 换行': 'Enter to send · Shift+Enter for newline', '当前对话用量与估算费用': 'Current conversation usage & estimated cost',
    '当前费率': 'Current pricing', '按模型与时段': 'By model and time tier', '工具权限模式': 'Tool permission mode', '手动审核': 'Manual', '沙盒自动': 'Sandbox auto',
    '全部放行': 'Allow all', '停止': 'Stop', '发送': 'Send', '已配置 ✓': 'Configured ✓', '未配置': 'Not configured',
    '官方': 'Official', '本地': 'Local', '运行时': 'Runtime', '未声明名称': 'Unnamed', '已关闭': 'Disabled',
    '核心锁定': 'Core locked', '已启用': 'Enabled', '未知': 'Unknown', '没有发现额外的本地插件文件。': 'No additional local plugin files found.',
    '尚未收到可管理的功能组。': 'No manageable feature groups received.', '没有收到诊断结果。': 'No diagnostic results received.',
    '未连接': 'Disconnected', '调用内容': 'Call input', '涉及位置': 'Affected locations', '文件变更': 'File change',
    '在 VS Code 打开差分': 'Open diff in VS Code', '工具输出': 'Tool output', '原始结果': 'Raw result',
    '修改前': 'Before', '修改后': 'After', '已回答': 'Answered', 'Plan 审核': 'Plan review',
    'Harness 需要用户回答': 'Harness needs user input', '请选择': 'Please choose', '选项': 'Option',
    '补充回答（可选）': 'Additional answer (optional)', '自定义回答（填写后将覆盖单选）': 'Custom answer (overrides the selected option)',
    '提交审核结果': 'Submit review', '提交回答': 'Submit answer', '已跳过': 'Skipped', '正在思考…': 'Thinking…',
    '思考过程': 'Reasoning', '等待 Harness 返回思考内容…': 'Waiting for Harness reasoning…', '工具调用': 'Tool call',
    '执行计划': 'Execution plan', '取消这条排队消息': 'Cancel this queued message', '审核完成': 'Approval complete',
    '需要用户确认': 'User confirmation required', 'Harness 请求执行操作': 'Harness requests an action', '出现问题': 'Something went wrong',
    '已归档': 'Archived', '取消归档': 'Unarchive', '归档': 'Archive', '删除此对话记录': 'Delete this conversation',
    '没有匹配的对话': 'No matching conversations', '还没有归档对话': 'No archived conversations yet', '还没有对话': 'No conversations yet',
    '显示更早的消息': 'Show earlier messages',
    '模式': 'Mode', '未命名目标': 'Untitled goal', '进行中': 'Active', '已暂停': 'Paused', '受阻': 'Blocked',
    '已完成': 'Complete', '工作中': 'Working', '空闲': 'Idle', '已结束': 'Ended', '正在工作': 'Working',
    '空闲待命': 'Idle', '可继续': 'Continuable', '单次': 'One-shot', '中断': 'Interrupt',
    '停止中…': 'Stopping…', '已确认停止 ✓': 'Stopped ✓', '尚未停止': 'Not stopped',
    '正在等待 Harness 确认停止…': 'Waiting for Harness to confirm stop…', 'Harness 尚未确认停止': 'Harness has not confirmed the stop',
    'Harness 已确认结束本轮任务': 'Harness confirmed this turn has ended', '正在创建新的空白上下文…': 'Creating a new empty context…',
    '上下文压缩功能组当前已关闭': 'Context compaction is currently disabled', '排队发送（Ctrl+Enter 立即插话）': 'Queue message (Ctrl+Enter to steer now)',
    '正在压缩较早的对话上下文…': 'Compacting earlier conversation context…', '当前对话和 Harness 上下文已清空': 'Current conversation and Harness context cleared',
    'pending': 'Pending', 'completed': 'Completed', 'in_progress': 'In progress', 'Allow once': 'Allow once', 'Reject': 'Reject',
    'Skills': 'Skills', 'Subagent': 'Subagent', 'Workflow / Ralph': 'Workflow / Ralph', 'Todo 与重复提醒': 'Todo & repeat reminders',
    '上下文压缩': 'Context compaction',
    'Harness 配置与权限审核是两套独立设置；当前不提供 Minimal、PTC 或实验预设切换。': 'Harness configuration and tool approval are independent. Minimal, PTC, and experimental preset switching are not currently available.',
    '模型、推理强度、预设及其他 Harness 设置请在 cordis.yml 中修改；修改后需要重启 Harness 生效。': 'Edit the model, reasoning effort, presets, and other Harness settings in cordis.yml, then restart Harness to apply them.',
    '核心组件保持锁定；以下开关会按依赖关系成组修改下一次运行时的组件目录。外部代码的安装与删除暂不自动执行。': 'Core components stay locked. These switches change grouped components for the next runtime; external code is not installed or removed automatically.',
    '按每次用量发生时的模型及 UTC 峰值／非峰值时段，以 DeepSeek 当前官方美元单价估算；实际账单以 DeepSeek 为准。': 'Estimates use DeepSeek’s current official USD rates for the model and UTC peak/off-peak tier active when each usage event occurs. Your DeepSeek bill is authoritative.',
  };

  const JA = {
    '所有对话': 'すべての会話', '新对话': '新しい会話', '当前对话名称': '現在の会話名', '点击修改对话名称': 'クリックして会話名を変更',
    '正在连接': '接続中', '新建对话': '新しい会話', '设置与管理': '設定と管理', '关闭': '閉じる',
    '搜索标题和内容…': 'タイトルと内容を検索…', '搜索对话': '会話を検索', '显示归档': 'アーカイブを表示',
    'DeepSeek Harness 运行环境': 'DeepSeek Harness 実行環境', '当前运行': '現在の実行状態', '连接状态': '接続状態',
    '扩展版本': '拡張機能バージョン', 'Harness 配置': 'Harness プリセット', '推理强度': '推論強度', '模型': 'モデル', '当前会话模型': '現在の会話モデル',
    'API 凭据': 'API 認証情報', '检查中': '確認中', '对话显示与安全': '会話表示と安全性', '界面语言': '表示言語',
    '工具审核': 'ツール承認', '工具审核方式': 'ツール承認モード', '全部手动审核': 'すべて手動承認',
    '沙盒内自动，越界询问': 'サンドボックス内は自動・範囲外は確認', '全部放行（超危险！）': 'すべて許可（非常に危険！）',
    '安全读取自动批准': '安全な読み取りを自動承認', '仅手动模式；限制在工作区内并排除密钥文件': '手動モードのみ・ワークスペース内に限定し認証情報ファイルを除外',
    '思考内容': '思考内容', '思考内容显示方式': '思考内容の表示方法', '默认展开': '既定で展開', '默认折叠': '既定で折りたたむ',
    '隐藏': '非表示', '路径与存储': 'パスと保存先', '工作目录': '作業ディレクトリ', '配置目录': '設定ディレクトリ',
    '会话记录': 'セッション履歴', '在 VS Code 中编辑路径设置': 'VS Code でパス設定を編集', 'Harness 插件': 'Harness プラグイン',
    '正在读取 Cordis 配置…': 'Cordis 設定を読み込み中…', '查看 Cordis 组件清单': 'Cordis コンポーネント一覧を表示',
    '打开 cordis.yml': 'cordis.yml を開く', '打开本地插件目录': 'ローカルプラグインフォルダーを開く', '对话整理': '会話の整理',
    'Compact 当前对话': '現在の会話を Compact', '/clear 当前对话': '現在の会話を /clear', '清空全部本地记录': 'ローカル履歴をすべて消去',
    '诊断': '診断', '重新检查': '再確認', '打开设置时自动检查。': '設定を開いたときに自動確認します。',
    '打开 Harness 日志': 'Harness ログを開く', '复制脱敏诊断': '秘匿化した診断情報をコピー', '重启 Harness': 'Harness を再起動',
    '暂停': '一時停止', '恢复': '再開', '清除 Goal': 'Goal を消去',
    '通过 ACP 在当前 VS Code 工作区中协作。': 'ACP を通じて現在の VS Code ワークスペースで作業します。',
    '向 DeepSeek Harness 提出任务…': 'DeepSeek Harness にタスクを依頼…', '上下文占用': 'コンテキスト使用量',
    '上下文占用尚未知': 'コンテキスト使用量はまだ不明です', '当前对话 Token 用量': '現在の会話のトークン使用量',
    'Enter 发送 · Shift+Enter 换行': 'Enter で送信 · Shift+Enter で改行', '当前对话用量与估算费用': '現在の会話の使用量と推定料金', '按模型与时段': 'モデル・時間帯別',
    '当前费率': '現在の料金', '工具权限模式': 'ツール権限モード', '手动审核': '手動承認', '沙盒自动': 'サンドボックス自動',
    '全部放行': 'すべて許可', '停止': '停止', '发送': '送信', '已配置 ✓': '設定済み ✓', '未配置': '未設定',
    '官方': '公式', '本地': 'ローカル', '运行时': 'ランタイム', '未声明名称': '名称未設定', '已关闭': '無効',
    '核心锁定': 'コア・ロック', '已启用': '有効', '未知': '不明', '没有发现额外的本地插件文件。': '追加のローカルプラグインファイルはありません。',
    '尚未收到可管理的功能组。': '管理可能な機能グループはまだありません。', '没有收到诊断结果。': '診断結果がありません。',
    '未连接': '未接続', '调用内容': '呼び出し内容', '涉及位置': '対象箇所', '文件变更': 'ファイル変更',
    '在 VS Code 打开差分': 'VS Code で差分を開く', '工具输出': 'ツール出力', '原始结果': '生の結果', '修改前': '変更前', '修改后': '変更後',
    '已回答': '回答済み', 'Plan 审核': 'Plan レビュー', 'Harness 需要用户回答': 'Harness が回答を求めています', '请选择': '選択してください',
    '选项': '選択肢', '补充回答（可选）': '補足回答（任意）', '自定义回答（填写后将覆盖单选）': '自由回答（入力すると単一選択を上書き）',
    '提交审核结果': 'レビュー結果を送信', '提交回答': '回答を送信', '已跳过': 'スキップ済み', '正在思考…': '思考中…',
    '思考过程': '思考過程', '等待 Harness 返回思考内容…': 'Harness の思考内容を待っています…', '工具调用': 'ツール呼び出し',
    '执行计划': '実行計画', '取消这条排队消息': 'この待機メッセージを取り消す', '审核完成': '承認完了',
    '需要用户确认': '確認が必要です', 'Harness 请求执行操作': 'Harness が操作の実行を求めています', '出现问题': '問題が発生しました',
    '已归档': 'アーカイブ済み', '取消归档': 'アーカイブ解除', '归档': 'アーカイブ', '删除此对话记录': 'この会話を削除',
    '没有匹配的对话': '一致する会話はありません', '还没有归档对话': 'アーカイブされた会話はありません', '还没有对话': '会話はまだありません',
    '显示更早的消息': '以前のメッセージを表示',
    '模式': 'モード', '未命名目标': '名称未設定の Goal', '进行中': '進行中', '已暂停': '一時停止中', '受阻': 'ブロック中',
    '已完成': '完了', '工作中': '作業中', '空闲': '待機', '已结束': '終了', '正在工作': '作業中', '空闲待命': '待機中',
    '可继续': '継続可能', '单次': '単発', '中断': '中断', '停止中…': '停止中…', '已确认停止 ✓': '停止確認済み ✓',
    '尚未停止': 'まだ停止していません', '正在等待 Harness 确认停止…': 'Harness の停止確認を待っています…',
    'Harness 尚未确认停止': 'Harness は停止をまだ確認していません', 'Harness 已确认结束本轮任务': 'Harness が今回のタスク終了を確認しました',
    '正在创建新的空白上下文…': '新しい空のコンテキストを作成中…', '上下文压缩功能组当前已关闭': 'コンテキスト圧縮機能は現在無効です',
    '排队发送（Ctrl+Enter 立即插话）': '送信待ちに追加（Ctrl+Enter ですぐに指示）', '正在压缩较早的对话上下文…': '以前の会話コンテキストを圧縮中…',
    '当前对话和 Harness 上下文已清空': '現在の会話と Harness コンテキストを消去しました',
    'pending': '待機中', 'completed': '完了', 'in_progress': '進行中', 'Allow once': '今回のみ許可', 'Reject': '拒否',
    'Skills': 'Skills', 'Subagent': 'Subagent', 'Workflow / Ralph': 'Workflow / Ralph', 'Todo 与重复提醒': 'Todo と繰り返し通知',
    '上下文压缩': 'コンテキスト圧縮',
    'Harness 配置与权限审核是两套独立设置；当前不提供 Minimal、PTC 或实验预设切换。': 'Harness 設定と権限承認は別の設定です。現在 Minimal、PTC、実験的プリセットの切り替えには対応していません。',
    '模型、推理强度、预设及其他 Harness 设置请在 cordis.yml 中修改；修改后需要重启 Harness 生效。': 'モデル、推論強度、プリセットなどの Harness 設定は cordis.yml で変更し、Harness を再起動して反映してください。',
    '核心组件保持锁定；以下开关会按依赖关系成组修改下一次运行时的组件目录。外部代码的安装与删除暂不自动执行。': 'コアコンポーネントはロックされています。以下のスイッチは依存関係ごとに次回ランタイムの構成を変更します。外部コードのインストールや削除は自動では行いません。',
    '按每次用量发生时的模型及 UTC 峰值／非峰值时段，以 DeepSeek 当前官方美元单价估算；实际账单以 DeepSeek 为准。': '各使用量が発生した時点のモデルと UTC のピーク／オフピーク区分に応じ、DeepSeek の現行公式米ドル料金で推定します。実際の請求は DeepSeek をご確認ください。',
  };

  Object.assign(EN, {
    'Current Cordis configuration': 'Current Cordis configuration', 'Harness 目录': 'Harness directory',
    'ACP 桥接文件': 'ACP bridge file', '会话目录': 'Session directory',
    '沙盒范围内自动执行，越界时询问': 'Run automatically inside the sandbox; ask when crossing it',
    '补充引导已加入当前任务，将在下一步生效。': 'Additional guidance was added to the current task and will apply on the next step.',
    '正在取消当前任务…': 'Cancelling the current task…', '清除当前 Goal？这不会删除聊天记录。': 'Clear the current Goal? Chat history will not be deleted.',
    '发现并调用配置目录中的自定义 Skills。': 'Discover and invoke custom Skills from the configuration directory.',
    '允许主 Agent 创建、派生和管理子 Agent。': 'Allow the primary Agent to create, fork, and manage subagents.',
    '启用工作流执行器和 Ralph 长任务循环。': 'Enable the workflow runner and Ralph long-task loop.',
    '启用任务列表工具和重复调用提醒。': 'Enable todo tools and repeated-call reminders.',
    '启用 Harness 上下文压缩和 Compact 功能。': 'Enable Harness context compaction and Compact.',
    '配置': 'Configuration', '当前对话': 'Current conversation', '正在启动 Harness…': 'Starting Harness…',
    '个核心组件': 'core components', '已配置启用': 'configured and enabled', '本地插件文件：': 'Local plugin files: ',
    '缓存': 'Cache', '未缓存输入': 'Uncached input', '输入': 'Input', '输出': 'Output', '峰值时段': 'Peak', '非峰值时段': 'Off-peak',
    '当前模型暂无价格资料': 'No pricing data for the current model', '尚无可计费用量。': 'No billable usage yet.',
    '旧用量缺少模型或计费时段，无法可靠估算。': 'Older usage lacks model or pricing-tier data and cannot be estimated reliably.',
    '旧用量缺少模型或时段，未计入': 'older usage lacks model or tier data and is excluded',
    '图片仍在读取，请稍候再发送。': 'Images are still loading. Please wait before sending.', '图片读取失败，请重新选择。': 'Could not read the image. Please select it again.',
    '图片预览': 'Image preview', '关闭图片预览': 'Close image preview', '点击查看原图': 'Click to view the original image', '查看原图': 'View original image',
    '思考中': 'Thinking', '排队': 'queue',
    '立即插话': 'steer now', '上下文': 'Context', '本轮': 'This turn',
    '压缩较早的 Harness 上下文（可能产生费用）': 'Compact earlier Harness context (may incur charges)',
    '清空当前对话并新建 Harness 上下文': 'Clear this conversation and create a new Harness context',
    '新建空白对话': 'Create a blank conversation', '打开会话搜索与归档': 'Open conversation search and archive',
    '归档当前对话': 'Archive the current conversation', '复制可见记录并开启新 Harness 上下文': 'Copy visible history into a new Harness context',
    '切换到 Harness Plan 模式（若可用）': 'Switch to Harness Plan mode (if available)',
    '切换回 Harness Code 模式（若可用）': 'Switch back to Harness Code mode (if available)',
    '打开扩展设置与管理': 'Open extension settings and management', '显示斜杠命令帮助': 'Show slash command help',
    '已复制脱敏诊断信息，API Key 和凭据内容未被读取。': 'Copied redacted diagnostics. API keys and credential contents were not read.',
    'Compact 会调用摘要模型压缩较早的对话内容，因此可能产生 API 费用。是否继续？': 'Compact uses a summarization model on earlier conversation content and may incur API charges. Continue?',
    '压缩完成后，后续请求需要携带的历史会减少；界面中的旧聊天记录不会被删除。': 'After compaction, later requests carry less history. Existing chat entries remain visible.',
    '开始 Compact': 'Start Compact', 'DeepSeek Harness 已有 90 秒没有返回思考、文本或工具活动，任务可能卡住。': 'DeepSeek Harness has returned no reasoning, text, or tool activity for 90 seconds and may be stuck.',
    '继续等待': 'Keep waiting', '强制停止并重连': 'Force stop and reconnect', '关闭并重启 Harness': 'Disable and restart Harness',
    '强制停止会重启本地 Harness 进程，并尝试接回当前会话。已经保存的聊天记录不会删除。': 'Force stop restarts the local Harness process and tries to resume this session. Saved chat history is retained.',
    '差分内容超过 2MB，已阻止打开。': 'The diff exceeds 2 MB and was blocked.', '请先在编辑器中选择一段内容。': 'Select some text in the editor first.',
    '选择内容超过 256KB，请缩小范围后再发送。': 'The selection exceeds 256 KB. Select a smaller range before sending.',
    '全部放行会关闭逐次工具审核，并解除文件沙盒边界。DeepSeek 随后可以直接修改整台机器。': 'Allow all disables per-tool approval and removes the filesystem sandbox boundary. DeepSeek can then modify the entire machine directly.',
    '这是超危险模式。仅在完全可信的工作区、且用户明确愿意承担风险时使用。': 'This mode is extremely dangerous. Use it only in a fully trusted workspace when you explicitly accept the risk.',
    '确认全部放行（超危险！）': 'Confirm allow all (extremely dangerous!)', '重新启动 DeepSeek Harness？': 'Restart DeepSeek Harness?',
    '当前仍有任务正在运行。重启会立即中断这些任务，但不会删除已经保存的聊天记录。': 'Tasks are still running. Restarting interrupts them immediately but does not delete saved chat history.',
    '这会重新启动本地 Harness 进程，并为当前对话重新连接会话。聊天记录不会删除。': 'This restarts the local Harness process and reconnects the current conversation. Chat history is retained.',
    '已阻止无效或不安全的外部链接。': 'Blocked an invalid or unsafe external link.', '打开链接': 'Open link',
  });
  Object.assign(JA, {
    'Current Cordis configuration': 'Current Cordis configuration', 'Harness 目录': 'Harness ディレクトリ',
    'ACP 桥接文件': 'ACP ブリッジファイル', '会话目录': 'セッションディレクトリ',
    '沙盒范围内自动执行，越界时询问': 'サンドボックス内は自動実行し、範囲外へ出るときに確認',
    '补充引导已加入当前任务，将在下一步生效。': '追加の指示を現在のタスクに加えました。次のステップから反映されます。',
    '正在取消当前任务…': '現在のタスクをキャンセル中…', '清除当前 Goal？这不会删除聊天记录。': '現在の Goal を消去しますか？会話履歴は削除されません。',
    '发现并调用配置目录中的自定义 Skills。': '設定ディレクトリ内のカスタム Skills を検出して呼び出します。',
    '允许主 Agent 创建、派生和管理子 Agent。': 'メイン Agent に Subagent の作成・派生・管理を許可します。',
    '启用工作流执行器和 Ralph 长任务循环。': 'ワークフロー実行機能と Ralph 長時間タスクループを有効にします。',
    '启用任务列表工具和重复调用提醒。': 'Todo ツールと繰り返し呼び出し通知を有効にします。',
    '启用 Harness 上下文压缩和 Compact 功能。': 'Harness のコンテキスト圧縮と Compact を有効にします。',
    '配置': '設定', '当前对话': '現在の会話', '正在启动 Harness…': 'Harness を起動中…',
    '个核心组件': '個のコアコンポーネント', '已配置启用': '設定済み・有効', '本地插件文件：': 'ローカルプラグインファイル：',
    '缓存': 'キャッシュ', '未缓存输入': '非キャッシュ入力', '输入': '入力', '输出': '出力', '峰值时段': 'ピーク', '非峰值时段': 'オフピーク',
    '当前模型暂无价格资料': '現在のモデルの料金情報がありません', '尚无可计费用量。': '課金対象の使用量はまだありません。',
    '旧用量缺少模型或计费时段，无法可靠估算。': '以前の使用量にはモデルまたは料金区分の情報がないため、正確に推定できません。',
    '旧用量缺少模型或时段，未计入': '以前の使用量はモデルまたは時間帯の情報がないため未計上',
    '图片仍在读取，请稍候再发送。': '画像を読み込み中です。少し待ってから送信してください。', '图片读取失败，请重新选择。': '画像を読み込めませんでした。もう一度選択してください。',
    '图片预览': '画像プレビュー', '关闭图片预览': '画像プレビューを閉じる', '点击查看原图': 'クリックして元画像を表示', '查看原图': '元画像を表示',
    '思考中': '思考中', '排队': '送信待ち',
    '立即插话': 'すぐに指示', '上下文': 'コンテキスト', '本轮': '今回',
    '压缩较早的 Harness 上下文（可能产生费用）': '以前の Harness コンテキストを圧縮（料金が発生する場合があります）',
    '清空当前对话并新建 Harness 上下文': '現在の会話を消去して新しい Harness コンテキストを作成',
    '新建空白对话': '空の会話を新規作成', '打开会话搜索与归档': '会話の検索とアーカイブを開く',
    '归档当前对话': '現在の会話をアーカイブ', '复制可见记录并开启新 Harness 上下文': '表示中の履歴を新しい Harness コンテキストへコピー',
    '切换到 Harness Plan 模式（若可用）': 'Harness Plan モードに切り替え（利用可能な場合）',
    '切换回 Harness Code 模式（若可用）': 'Harness Code モードに戻す（利用可能な場合）',
    '打开扩展设置与管理': '拡張機能の設定と管理を開く', '显示斜杠命令帮助': 'スラッシュコマンドのヘルプを表示',
    '已复制脱敏诊断信息，API Key 和凭据内容未被读取。': '秘匿化した診断情報をコピーしました。API Key と認証情報の内容は読み取っていません。',
    'Compact 会调用摘要模型压缩较早的对话内容，因此可能产生 API 费用。是否继续？': 'Compact は要約モデルで以前の会話を圧縮するため、API 料金が発生する場合があります。続行しますか？',
    '压缩完成后，后续请求需要携带的历史会减少；界面中的旧聊天记录不会被删除。': '圧縮後は以降のリクエストに含める履歴が減ります。画面上の過去の会話は削除されません。',
    '开始 Compact': 'Compact を開始', 'DeepSeek Harness 已有 90 秒没有返回思考、文本或工具活动，任务可能卡住。': 'DeepSeek Harness から思考・テキスト・ツール活動が 90 秒間返っていません。停止している可能性があります。',
    '继续等待': '待機を続ける', '强制停止并重连': '強制停止して再接続', '关闭并重启 Harness': '無効にして Harness を再起動',
    '强制停止会重启本地 Harness 进程，并尝试接回当前会话。已经保存的聊天记录不会删除。': '強制停止するとローカル Harness プロセスを再起動し、現在のセッションへの再接続を試みます。保存済みの会話履歴は削除されません。',
    '差分内容超过 2MB，已阻止打开。': '差分が 2 MB を超えたため、表示をブロックしました。', '请先在编辑器中选择一段内容。': '先にエディターでテキストを選択してください。',
    '选择内容超过 256KB，请缩小范围后再发送。': '選択範囲が 256 KB を超えています。範囲を小さくしてから送信してください。',
    '全部放行会关闭逐次工具审核，并解除文件沙盒边界。DeepSeek 随后可以直接修改整台机器。': 'すべて許可するとツールごとの承認とファイルサンドボックス境界が無効になり、DeepSeek がマシン全体を直接変更できるようになります。',
    '这是超危险模式。仅在完全可信的工作区、且用户明确愿意承担风险时使用。': '非常に危険なモードです。完全に信頼できるワークスペースで、危険性を明確に受け入れる場合のみ使用してください。',
    '确认全部放行（超危险！）': 'すべて許可を確認（非常に危険！）', '重新启动 DeepSeek Harness？': 'DeepSeek Harness を再起動しますか？',
    '当前仍有任务正在运行。重启会立即中断这些任务，但不会删除已经保存的聊天记录。': '実行中のタスクがあります。再起動すると直ちに中断されますが、保存済みの会話履歴は削除されません。',
    '这会重新启动本地 Harness 进程，并为当前对话重新连接会话。聊天记录不会删除。': 'ローカル Harness プロセスを再起動し、現在の会話へ再接続します。会話履歴は削除されません。',
    '已阻止无效或不安全的外部链接。': '無効または安全でない外部リンクをブロックしました。', '打开链接': 'リンクを開く',
  });

  function normalizeLocale(value) {
    const raw = String(value || 'zh-CN');
    if (SUPPORTED.has(raw)) return raw;
    if (raw.toLowerCase().startsWith('ja')) return 'ja';
    if (raw.toLowerCase().startsWith('en')) return 'en';
    return 'zh-CN';
  }

  function dynamic(source, locale) {
    const dict = locale === 'en' ? EN : JA;
    let match = source.match(/^(\d+) 个组件$/);
    if (match) return locale === 'en' ? `${match[1]} components` : `${match[1]} コンポーネント`;
    match = source.match(/^已连接 · (\d+) 个任务运行中$/);
    if (match) return locale === 'en' ? `Connected · ${match[1]} active tasks` : `接続済み · 実行中タスク ${match[1]} 件`;
    match = source.match(/^问题 (\d+)$/);
    if (match) return locale === 'en' ? `Question ${match[1]}` : `質問 ${match[1]}`;
    match = source.match(/^已排队(?: · 第 (\d+) 条)?$/);
    if (match) return locale === 'en' ? `Queued${match[1] ? ` · #${match[1]}` : ''}` : `送信待ち${match[1] ? ` · ${match[1]} 番目` : ''}`;
    match = source.match(/^共 (\d+)(?:（(.+)）)?$/);
    if (match) {
      const detail = match[2] ? translateFragments(match[2], locale) : '';
      return locale === 'en' ? `${match[1]} total${detail ? ` (${detail})` : ''}` : `合計 ${match[1]}${detail ? `（${detail}）` : ''}`;
    }
    match = source.match(/^已选择：(.+)$/);
    if (match) return locale === 'en' ? `Selected: ${translate(match[1], locale)}` : `選択済み：${translate(match[1], locale)}`;
    match = source.match(/^本轮 ([\d,.]+) tokens$/);
    if (match) return locale === 'en' ? `This turn: ${match[1]} tokens` : `今回：${match[1]} tokens`;
    match = source.match(/^关闭“(.+)”功能组？$/);
    if (match) return locale === 'en' ? `Disable the “${translate(match[1], locale)}” feature group?` : `「${translate(match[1], locale)}」機能グループを無効にしますか？`;
    match = source.match(/^将从下一次 Harness 启动配置中移除 (\d+) 个相关组件，并创建新的运行时会话。聊天记录不会删除。$/);
    if (match) return locale === 'en' ? `The next Harness runtime will omit ${match[1]} related components and create a new runtime session. Chat history is retained.` : `次回の Harness 起動設定から関連コンポーネント ${match[1]} 個を除外し、新しいランタイムセッションを作成します。会話履歴は削除されません。`;
    match = source.match(/^“(.+)”已(开启|关闭)，Harness 运行时已重启并使用新的组件目录。$/);
    if (match) return locale === 'en' ? `“${translate(match[1], locale)}” is now ${match[2] === '开启' ? 'enabled' : 'disabled'}. Harness restarted with the new component inventory.` : `「${translate(match[1], locale)}」を${match[2] === '开启' ? '有効' : '無効'}にしました。新しいコンポーネント構成で Harness を再起動しました。`;
    match = source.match(/^安全读取自动批准已(开启|关闭)，Harness 运行时已重启。$/);
    if (match) return locale === 'en' ? `Safe-read auto-approval is ${match[1] === '开启' ? 'enabled' : 'disabled'}; Harness restarted.` : `安全な読み取りの自動承認を${match[1] === '开启' ? '有効' : '無効'}にし、Harness を再起動しました。`;
    match = source.match(/^路径不存在：(.+)$/s);
    if (match) return locale === 'en' ? `Path does not exist: ${match[1]}` : `パスが存在しません：${match[1]}`;
    match = source.match(/^是否在浏览器中打开此链接？\n(.+)$/s);
    if (match) return locale === 'en' ? `Open this link in your browser?\n${match[1]}` : `このリンクをブラウザーで開きますか？\n${match[1]}`;
    match = source.match(/^正在切换到 (.+) 模式…$/);
    if (match) return locale === 'en' ? `Switching to ${match[1]} mode…` : `${match[1]} モードに切り替え中…`;
    match = source.match(/^上下文 ([\d,.]+) \/ ([\d,.]+)$/);
    if (match) return locale === 'en' ? `Context ${match[1]} / ${match[2]}` : `コンテキスト ${match[1]} / ${match[2]}`;
    match = source.match(/^(.+) · (峰值时段|非峰值时段)( · 缓存 \$[\d.]+\/M · 输入 \$[\d.]+\/M · 输出 \$[\d.]+\/M)?$/);
    if (match) {
      const tier = match[2] === '峰值时段' ? (locale === 'en' ? 'Peak' : 'ピーク') : (locale === 'en' ? 'Off-peak' : 'オフピーク');
      const rates = match[3] ? translateFragments(match[3], locale) : '';
      return `${match[1]} · ${tier}${rates}`;
    }
    match = source.match(/^缓存 \$([\d.]+) ＋ 未缓存输入 \$([\d.]+) ＋ 输出 \$([\d.]+)(（\* 旧用量缺少模型或时段，未计入）)?$/);
    if (match) {
      const base = locale === 'en' ? `Cache $${match[1]} + uncached input $${match[2]} + output $${match[3]}` : `キャッシュ $${match[1]} ＋ 非キャッシュ入力 $${match[2]} ＋ 出力 $${match[3]}`;
      if (!match[4]) return base;
      return locale === 'en' ? `${base} (* older usage excluded: missing model or tier data)` : `${base}（* 以前の使用量はモデルまたは時間帯の情報がないため未計上）`;
    }
    // Harness/tool/error 文本可能恰好包含 UI 字典片段；未命中明确模式时保持原文。
    return source;
  }

  function translateFragments(source, locale, dict = locale === 'en' ? EN : JA) {
    const fragments = Object.entries(dict).filter(([key]) => source.includes(key)).sort((a, b) => b[0].length - a[0].length);
    let result = source;
    for (const [from, to] of fragments) result = result.split(from).join(to);
    return result;
  }

  function translate(source, localeValue) {
    if (typeof source !== 'string') return source;
    const locale = normalizeLocale(localeValue);
    if (locale === 'zh-CN') return source;
    const leading = source.match(/^\s*/)?.[0] || '';
    const trailing = source.match(/\s*$/)?.[0] || '';
    const core = source.slice(leading.length, source.length - trailing.length || undefined);
    if (!core) return source;
    const dict = locale === 'en' ? EN : JA;
    return `${leading}${dict[core] || dynamic(core, locale)}${trailing}`;
  }

  function createDomLocalizer(document, localeGetter) {
    const textState = new WeakMap();
    const attributeState = new WeakMap();
    const attributes = ['title', 'placeholder', 'aria-label'];
    const visit = (rootNode) => {
      if (!rootNode) return;
      const walker = document.createTreeWalker(rootNode, 0x1 | 0x4);
      let node = walker.currentNode;
      while (node) {
        if (node.nodeType === 3) {
          const previous = textState.get(node);
          const raw = node.nodeValue || '';
          const source = previous && raw === previous.rendered ? previous.source : raw;
          const rendered = translate(source, localeGetter());
          textState.set(node, { source, rendered });
          if (raw !== rendered) node.nodeValue = rendered;
        } else if (node.nodeType === 1 && !node.hasAttribute('data-i18n-skip')) {
          const records = attributeState.get(node) || {};
          for (const name of attributes) {
            if (!node.hasAttribute(name)) continue;
            const raw = node.getAttribute(name) || '';
            const previous = records[name];
            const source = previous && raw === previous.rendered ? previous.source : raw;
            const rendered = translate(source, localeGetter());
            records[name] = { source, rendered };
            if (raw !== rendered) node.setAttribute(name, rendered);
          }
          attributeState.set(node, records);
        }
        node = walker.nextNode();
      }
    };
    return { refresh: (roots) => (Array.isArray(roots) ? roots : [roots]).forEach(visit) };
  }

  return Object.freeze({ normalizeLocale, translate, createDomLocalizer });
});
