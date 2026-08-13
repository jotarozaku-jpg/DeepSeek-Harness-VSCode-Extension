# RRMA DeepseekHarness

一个通过 ACP 连接 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的非官方 Visual Studio Code 客户端。

这是独立的 Visual Studio Code 扩展项目。仓库不包含 DeepSeek Harness 源码，也不包含任何 RRMA 私有配置、人格提示、API Key 或对话记录。

> 状态：早期预览。DeepSeek Harness 本身仍处于开发者预览阶段；在上游 ACP 入口趋于稳定之前，本扩展暂时使用固定版本的小型兼容适配层。

## 功能

- 在编辑器标签页中提供完整聊天界面
- 流式回答，以及可显示、折叠或隐藏的思考内容
- 可审核和折叠的 Tool Call 与权限确认
- 全部手动、工作区沙盒、全部放行三档权限模式
- 持久化对话列表、重命名、恢复对话和未读红点
- 原生 diff 与工作区文件引用
- 打断、引导和 Compact
- Input、Output 与缓存 Token 估算

## 项目边界

这个仓库只包含：

- Visual Studio Code 扩展；
- 小型 ACP 兼容适配层；
- 安装和检查脚本；
- 公开文档。

官方 Harness 仓库及其依赖安装在本项目之外。API Key、会话、skills 和可选的 `persona.md` 也保存在机器本地，不进入 Git。

## 安装

本项目只公开源码，不发布或分发预先打包的 `.vsix`，也不上架 Visual Studio Marketplace。每位使用者需要自行准备外部 Harness、在本地打包扩展，再安装自己生成的 VSIX。扩展会检查外部 Harness 是否缺失并提供安装说明入口，但不会自动下载或修改 Harness。

参见[安装说明](docs/INSTALL.md)；如果希望让 Codex、Claude Code 等 Agent 协助安装，可使用[面向 Agent 的安装说明](docs/INSTALL_FOR_AGENTS.md)。准备完成后，按 `Ctrl+Alt+D`，或从命令面板运行 `RRMA DeepseekHarness: Open Chat`。

## 开发

```powershell
npm.cmd run check
npm.cmd run smoke:approval
npm.cmd run smoke:auto-approval
npm.cmd run smoke:security
npm.cmd run package
```

集成测试依赖外部 Harness 环境，因此不会混入默认检查。

## 安全

扩展默认使用全部手动审核。全部放行模式会移除重要的安全边界，并明确标记为“超危险”。请认真检查 Tool Call，把凭据保存在 Git 仓库之外，并且只在完全可信的工作区中启用更宽松的权限。

提示词、选择的文件、工作区上下文、工具结果及其他对话数据可能会经 DeepSeek Harness 发送至 DeepSeek API。使用者需要自行判断可以发送哪些数据，并遵守适用的 DeepSeek 服务条款、隐私规则和 API 计费要求。本项目自身不收集额外的分析数据或遥测。

## 免责声明

这是一个以 vibecoding 方式制作、按现状提供且不附带担保的非官方个人项目。详见 [DISCLAIMER.md](DISCLAIMER.md)。

DeepSeek 与 DeepSeek Harness 属于其各自权利人。本项目与 DeepSeek 不存在隶属或官方认可关系。

---

## English

An unofficial Visual Studio Code client for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), connected over ACP.

This is a standalone Visual Studio Code extension project. It does not contain the DeepSeek Harness source tree, private RRMA configuration, persona prompts, API keys, or conversation records.

> Status: early preview. DeepSeek Harness itself is currently a developer preview, and this extension uses a pinned compatibility adapter while the upstream ACP entry point is still evolving.

### Features

- Full editor-tab chat UI
- Streaming responses and optional thought display
- Reviewable, collapsible tool calls and permission prompts
- Manual, workspace-sandbox and unrestricted approval modes
- Persistent conversation list, rename, resume and unread indicators
- Native diffs and workspace file references
- Interrupt, steer and compact controls
- Input, output and cache-token estimates

### Project boundary

This repository contains only:

- the Visual Studio Code extension;
- a small ACP compatibility adapter;
- setup and verification scripts;
- public documentation.

The official Harness checkout and its dependencies are installed outside this repository. Machine-local credentials, sessions, skills and optional `persona.md` also stay outside Git.

### Installation

This is a source-only project. The repository does not publish or distribute prebuilt `.vsix` files and is not listed on the Visual Studio Marketplace. Each user prepares the external Harness, packages the extension locally, and installs the locally generated VSIX. The extension detects missing runtime files and links to the setup guide, but deliberately does not download or modify Harness automatically.

See [Installation](docs/INSTALL.md) or [Agent-assisted installation](docs/INSTALL_FOR_AGENTS.md). After setup, use `Ctrl+Alt+D` or run `RRMA DeepseekHarness: Open Chat` from the Command Palette.

### Development

```powershell
npm.cmd run check
npm.cmd run smoke:approval
npm.cmd run smoke:auto-approval
npm.cmd run smoke:security
npm.cmd run package
```

Integration tests require an external Harness checkout and are intentionally separate from the default check.

### Security

The extension defaults to manual approval. The unrestricted mode removes meaningful safety boundaries and is marked as extremely dangerous. Review tool calls, keep credentials out of repositories, and only enable broader permissions in workspaces you fully trust.

Prompts, selected files, workspace context, tool results, and other conversation data may be sent through DeepSeek Harness to the DeepSeek API. Users are responsible for deciding what data to send and for complying with the applicable DeepSeek service terms, privacy rules, and API charges. This project does not collect separate analytics or telemetry.

### Disclaimer

This is an unofficial, vibecoded personal project provided as-is and without warranty. See [DISCLAIMER.md](DISCLAIMER.md).

DeepSeek and DeepSeek Harness belong to their respective owners. This project is not affiliated with or endorsed by DeepSeek.
