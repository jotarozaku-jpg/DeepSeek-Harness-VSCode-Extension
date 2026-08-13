# RRMA DeepseekHarness

[简体中文](README.zh-CN.md)

An unofficial VS Code client for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), connected over ACP.

This is a standalone VS Code extension project. It does not contain the DeepSeek Harness source tree, private RRMA configuration, persona prompts, API keys, or conversation records.

> Status: early preview. DeepSeek Harness itself is currently a developer preview, and this extension uses a pinned compatibility adapter while the upstream ACP entry point is still evolving.

## Features

- Full editor-tab chat UI
- Streaming responses and optional thought display
- Reviewable, collapsible tool calls and permission prompts
- Manual, workspace-sandbox and unrestricted approval modes
- Persistent conversation list, rename, resume and unread indicators
- Native VS Code diffs and workspace file references
- Interrupt, steer and compact controls
- Input, output and cache-token estimates

## Project boundary

This repository contains only:

- the VS Code extension;
- a small ACP compatibility adapter;
- setup and verification scripts;
- public documentation.

The official Harness checkout and its dependencies are installed outside this repository. Machine-local credentials, sessions, skills and optional `persona.md` also stay outside Git.

## Installation

This is a source-only project. The repository does not publish or distribute prebuilt `.vsix` files and is not listed on the Visual Studio Marketplace. Each user prepares the external Harness, packages the extension locally, and installs the locally generated VSIX. The extension detects missing runtime files and links to the setup guide, but deliberately does not download or modify Harness automatically. See [Installation](docs/INSTALL.md) or [Agent-assisted installation](docs/INSTALL_FOR_AGENTS.md).

After setup, use `Ctrl+Alt+D` or run `RRMA DeepseekHarness: Open Chat` from the Command Palette.

## Development

```powershell
npm.cmd run check
npm.cmd run smoke:approval
npm.cmd run smoke:auto-approval
npm.cmd run smoke:security
npm.cmd run package
```

Integration tests require an external Harness checkout and are intentionally separate from the default check.

## Security

The extension defaults to manual approval. The unrestricted mode removes meaningful safety boundaries and is marked as extremely dangerous. Review tool calls, keep credentials out of repositories, and only enable broader permissions in workspaces you fully trust.

Prompts, selected files, workspace context, tool results, and other conversation data may be sent through DeepSeek Harness to the DeepSeek API. Users are responsible for deciding what data to send and for complying with the applicable DeepSeek service terms, privacy rules, and API charges. This project does not collect separate analytics or telemetry.

## Disclaimer

This is an unofficial, vibecoded personal project provided as-is and without warranty. See [DISCLAIMER.md](DISCLAIMER.md).

DeepSeek and DeepSeek Harness belong to their respective owners. This project is not affiliated with or endorsed by DeepSeek.
