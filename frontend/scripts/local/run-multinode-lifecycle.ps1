# Run the cross-participant governance lifecycle script against running Canton nodes.
# Prerequisite: .\scripts\local\start-canton.cmd in another terminal.

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
Set-Location $repoRoot

$dar = "daml-script\.daml\dist\veilio-governance-scripts-0.2.0.dar"
$legacyDar = "daml-script\.daml\dist\veilio-governance-demo-0.2.0.dar"
$config = "canton\participants.json"

if ((-not (Test-Path $dar)) -and (Test-Path $legacyDar)) {
    $dar = $legacyDar
}

if (-not (Test-Path $dar)) {
    Write-Host "DAR not found. Building..."
    daml build --all
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (-not (Test-Path $config)) {
    Write-Error "Participant config not found at $config. Start Canton first: .\scripts\local\start-canton.cmd"
    exit 1
}

Write-Host "Running multinode lifecycle validation (owner@participant1, recipient@participant2)..."
daml script `
    --dar $dar `
    --script-name Veilio.LifecycleMultinode:lifecycleMultinode `
    --participant-config $config `
    --wall-clock-time
