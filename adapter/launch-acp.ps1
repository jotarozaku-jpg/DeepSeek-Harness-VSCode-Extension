$ErrorActionPreference = 'Stop'

$adapterRoot = $PSScriptRoot
$projectRoot = Split-Path -Parent $adapterRoot
$defaultConfigRoot = Join-Path $env:USERPROFILE '.deepseek-harness-vscode'
$configRoot = if ($env:DSH_HOME) {
    $env:DSH_HOME
} else {
    $defaultConfigRoot
}
$harnessRoot = if ($env:DSH_HARNESS_ROOT) {
    $env:DSH_HARNESS_ROOT
} else {
    Join-Path $env:USERPROFILE '.deepseek-harness'
}

$entryPoint = Join-Path $harnessRoot 'packages\examples\acp-demo\lib\bin.js'
$bridgePath = Join-Path $adapterRoot 'acp-bridge.mjs'
$configPath = Join-Path $adapterRoot 'cordis.yml'

if (-not (Test-Path -LiteralPath $entryPoint)) {
    throw "DeepSeek Harness ACP entry point not found: $entryPoint. Run setup.ps1 first."
}
if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Harness config not found: $configPath"
}
if (-not (Test-Path -LiteralPath $bridgePath)) {
    throw "ACP bridge not found: $bridgePath"
}
# Harness reads credentials, skills, settings, and other user-plane data here.
$env:DSH_HOME = $configRoot
$env:DSH_HARNESS_ROOT = $harnessRoot
$env:DSH_CORDIS_CONFIG = $configPath
if (-not $env:DSH_PERMISSION_MODE) {
    $env:DSH_PERMISSION_MODE = 'workspace-write'
}

Push-Location $projectRoot
try {
    & node $bridgePath
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
