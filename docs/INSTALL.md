# Installation / 安装

The public repository contains the VS Code extension and a compatibility adapter, not the DeepSeek Harness source tree. The setup script downloads a pinned official Harness checkout to a user-local directory and builds it there.

公开仓库只包含 VS Code 扩展和兼容适配层，不包含 DeepSeek Harness 源码。安装脚本会把固定版本的官方 Harness 下载到用户本地目录并在那里构建。

## Prerequisites / 前置条件

- Windows with PowerShell
- Git
- Node.js and npm
- Visual Studio Code 1.95 or newer
- A DeepSeek API key

## Source-only distribution / 仅源码发布

This project does not provide a prebuilt `.vsix` and is not published to the Visual Studio Marketplace. Clone or download this repository, then follow the steps below to prepare the external runtime and build a VSIX for your own local installation.

本项目不提供预先打包的 `.vsix`，也不上架 Visual Studio Marketplace。请克隆或下载本仓库，再按照以下步骤准备外部运行环境，并为自己的本地安装打包 VSIX。

## Prepare the preview runtime / 准备预览环境

From the repository root, prepare the external runtime:

在仓库根目录运行以下命令，准备外部运行环境：

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\adapter\setup.ps1
```

This may download and build a large dependency tree under `%USERPROFILE%\.deepseek-harness`. It is intentionally outside this repository and should not be committed.

该步骤会在 `%USERPROFILE%\.deepseek-harness` 下载和构建较大的依赖树。它有意放在本仓库之外，不应提交到 Git。

Create the machine-local credential file:

创建机器本地凭据文件：

```powershell
Copy-Item "$env:USERPROFILE\.rrma-deepseek-harness\.credentials.example.yaml" `
  "$env:USERPROFILE\.rrma-deepseek-harness\.credentials.yaml"
```

Open `.credentials.yaml` locally and replace the placeholder with your own key. Never commit or paste the key into an issue.

请只在本机编辑 `.credentials.yaml` 并替换占位值。不要把 API Key 提交到 Git，也不要粘贴到 Issue。

Package and install the extension:

打包并安装扩展：

```powershell
npm.cmd run check
npm.cmd run package
code --install-extension .\dist\rrma-deepseek-harness.vsix
```

Reload VS Code, open a trusted workspace, and run `RRMA DeepseekHarness: Open Chat`.

重新加载 VS Code，打开可信任的工作区，然后运行 `RRMA DeepseekHarness: Open Chat`。

If the external runtime or machine-local configuration is missing, the extension links back to this guide. It does not download or modify Harness automatically.

如果外部运行环境或机器本地配置缺失，扩展会提供本说明的入口，但不会自动下载或修改 Harness。

## Custom locations / 自定义路径

The defaults are:

- Harness checkout: `%USERPROFILE%\.deepseek-harness`
- Machine-local configuration: `%USERPROFILE%\.rrma-deepseek-harness`
- Session history: `%USERPROFILE%\.dsh\.sessions`

Override them with `deepseekHarness.harnessRoot`, `deepseekHarness.configRoot`, or the corresponding setup environment variables when needed.
