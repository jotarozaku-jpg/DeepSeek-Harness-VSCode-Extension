$ErrorActionPreference = 'Stop'

$repoUrl = 'https://github.com/deepseek-ai/deepseek-harness.git'
$harnessRoot = if ($env:DSH_HARNESS_ROOT) {
    $env:DSH_HARNESS_ROOT
} else {
    Join-Path $env:USERPROFILE '.deepseek-harness'
}
$defaultConfigRoot = Join-Path $env:USERPROFILE '.deepseek-harness-vscode'
$configRoot = if ($env:DSH_HOME) {
    $env:DSH_HOME
} else {
    $defaultConfigRoot
}
$versionFile = Join-Path $PSScriptRoot 'harness-version.txt'
$pinnedCommit = (Get-Content -LiteralPath $versionFile -Raw).Trim()
$acpPatches = @(
    (Join-Path $PSScriptRoot 'patches\acp-rich-events.patch'),
    (Join-Path $PSScriptRoot 'patches\acp-resume-compact.patch'),
    (Join-Path $PSScriptRoot 'patches\acp-steer.patch')
)

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js was not found in PATH.'
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git was not found in PATH.'
}

if (-not (Test-Path -LiteralPath $harnessRoot)) {
    git clone $repoUrl $harnessRoot
    if ($LASTEXITCODE -ne 0) { throw 'git clone failed.' }
}

$actualRoot = (git -C $harnessRoot rev-parse --show-toplevel 2>$null).Trim()
if (-not $actualRoot) {
    throw "Existing path is not a Git checkout: $harnessRoot"
}

$originUrl = (git -C $harnessRoot remote get-url origin 2>$null).Trim()
$normalizedOrigin = $originUrl.ToLowerInvariant().TrimEnd('/') -replace '\.git$', ''
$expectedOrigin = 'https://github.com/deepseek-ai/deepseek-harness'
if ($normalizedOrigin -ne $expectedOrigin) {
    throw "Refusing to update an unexpected Harness origin: $originUrl`nExpected: $repoUrl"
}

$dirty = git -C $harnessRoot status --porcelain
if ($dirty) {
    throw "Harness checkout has local source changes; setup will not overwrite them: $harnessRoot`nTo recover: git -C `"$harnessRoot`" checkout -- . then run setup again."
}

git -C $harnessRoot fetch origin $pinnedCommit
if ($LASTEXITCODE -ne 0) { throw 'git fetch failed.' }
$resolvedCommit = (git -C $harnessRoot rev-parse "$pinnedCommit^{commit}" 2>$null).Trim()
if ($resolvedCommit -ne $pinnedCommit) { throw 'Pinned Harness commit could not be verified after fetch.' }
git -C $harnessRoot switch --detach $pinnedCommit
if ($LASTEXITCODE -ne 0) { throw 'git switch failed.' }
foreach ($acpPatch in $acpPatches) {
    git -C $harnessRoot apply --check --ignore-space-change --ignore-whitespace $acpPatch
    if ($LASTEXITCODE -ne 0) { throw "ACP compatibility patch does not apply: $acpPatch" }
    git -C $harnessRoot apply --ignore-space-change --ignore-whitespace $acpPatch
    if ($LASTEXITCODE -ne 0) { throw "Applying the ACP compatibility patch failed: $acpPatch" }
}

Push-Location $harnessRoot
try {
    & npx.cmd --yes pnpm@11.7.0 install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    & npx.cmd --yes pnpm@11.7.0 run build
    if ($LASTEXITCODE -ne 0) { throw 'Harness build failed.' }
} finally {
    Pop-Location
    [array]::Reverse($acpPatches)
    foreach ($acpPatch in $acpPatches) {
        git -C $harnessRoot apply --reverse --ignore-space-change --ignore-whitespace $acpPatch
        if ($LASTEXITCODE -ne 0) { Write-Warning "Could not remove temporary ACP source patch: $acpPatch" }
    }
}

Write-Host "DeepSeek Harness is ready at $harnessRoot"
New-Item -ItemType Directory -Path $configRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $configRoot 'skills') -Force | Out-Null
$credentialExample = Join-Path $PSScriptRoot '.credentials.example.yaml'
$installedExample = Join-Path $configRoot '.credentials.example.yaml'
Copy-Item -LiteralPath $credentialExample -Destination $installedExample -Force
Write-Host "Machine-local configuration is ready at $configRoot"
Write-Host "Copy .credentials.example.yaml to .credentials.yaml and enter your own API key before starting the extension."
