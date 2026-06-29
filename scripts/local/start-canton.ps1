# Start Veilio five-participant Canton sandbox.
# Usage: .\scripts\local\start-canton.ps1
# Stop with Ctrl+C in this terminal.

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
Set-Location $repoRoot

$sdkRoot = Join-Path $env:APPDATA "daml\sdk\3.4.11"
$cantonJar = Join-Path $sdkRoot "canton\canton.jar"

if (-not (Test-Path $cantonJar)) {
    Write-Error "Canton JAR not found at $cantonJar. Install Daml SDK 3.4.11."
    exit 1
}

Write-Host "Stopping any stale Canton processes..."
powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\stop-canton.ps1"

Write-Host "Building Daml packages..."
daml build --all
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Starting Canton multinode (daemon mode)..."
Write-Host "  participant1 -> localhost:5011"
Write-Host "  participant2 -> localhost:5021"
Write-Host "  participant3 -> localhost:5031"
Write-Host "  participant4 -> localhost:5041"
Write-Host "  participant5 -> localhost:5051"
Write-Host "Press Ctrl+C to stop."
Write-Host ""

java -jar $cantonJar daemon `
    -c canton/veilio-multinode.conf `
    --bootstrap canton/bootstrap.canton `
    --no-tty
