# Agent-assisted installation contract

This file is intended for coding agents helping a person install RRMA DeepseekHarness.

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
3. Use the machine-local configuration directory printed by `setup.ps1`. A new installation uses `%USERPROFILE%\.deepseek-harness-vscode`; if only the legacy `%USERPROFILE%\.rrma-deepseek-harness` exists, setup keeps using it rather than moving or copying secrets without the owner's explicit approval.
4. In that selected directory, if `.credentials.yaml` is absent, copy `.credentials.example.yaml` to that name and stop for the owner to enter the key locally.
5. Run `npm.cmd run check` and the three default smoke tests.
6. Run `npm.cmd run package` locally. Treat the generated VSIX as a local build artifact; do not upload or redistribute it.
7. Install `dist\rrma-deepseek-harness.vsix` with `code --install-extension` only after confirmation.
8. Ask the owner to reload VS Code, open a trusted workspace, and use `RRMA DeepseekHarness: Open Chat`.

If setup or a compatibility patch fails, report the exact pinned Harness commit from `adapter/harness-version.txt` and stop. Do not silently switch to another upstream revision.
