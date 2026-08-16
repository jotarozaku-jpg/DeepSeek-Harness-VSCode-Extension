# Agent-assisted installation contract

This file is intended for coding agents helping a person install DeepSeek Harness for VS Code.

The project is source-only. Do not search for, download, upload, or publish a prebuilt VSIX. Package it locally for the owner after confirmation.

## Boundaries

- Install the official DeepSeek Harness checkout outside this repository.
- Do not copy the upstream Harness source tree, `node_modules`, credentials, sessions, skills, persona files, or machine-specific settings into this repository.
- Never request that the owner paste an API key into chat. Ask the owner to enter it directly into the local `.credentials.yaml` file.
- Do not enable unrestricted approval mode on the owner's behalf.
- Explain the expected large external download before running setup.
- Obtain the owner's confirmation before installation, packaging, VS Code restart/reload, or file deletion.

## Deterministic Windows flow

1. Verify `git`, `node`, `npm`, and `code` are available.
2. From the repository root, run `adapter\setup.ps1`. It installs the pinned official Harness under `%USERPROFILE%\.deepseek-harness` by default. The extension does not run this automatically.
3. Use the machine-local configuration directory printed by `setup.ps1`. The default is `%USERPROFILE%\.deepseek-harness-vscode`.
4. In that selected directory, if `.credentials.yaml` is absent, copy `.credentials.example.yaml` to that name and stop for the owner to enter the key locally.
5. Run `npm.cmd run check`, `npm.cmd run smoke:approval`, `npm.cmd run smoke:auto-approval`, `npm.cmd run smoke:security`, and `npm.cmd run smoke:feature-groups`.
6. Run `npm.cmd run package` locally. Treat the generated VSIX as a local build artifact; do not upload or redistribute it.
7. Install `dist\deepseek-harness-vscode.vsix` with `code --install-extension` only after confirmation.
8. Ask the owner to reload VS Code, open a trusted workspace, and use `DeepSeek Harness: Open Chat`.

If setup or a compatibility patch fails, report the exact pinned Harness commit from `adapter/harness-version.txt` and stop. Do not silently switch to another upstream revision.
