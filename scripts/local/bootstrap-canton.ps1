# Bootstrap a running Canton multinode (connect synchronizer, upload DARs).
# Normally handled automatically by start-canton.ps1 via --bootstrap.
# Use this only if Canton is running without bootstrap.

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
Set-Location $repoRoot

$sdkRoot = Join-Path $env:APPDATA "daml\sdk\3.4.11"
$cantonJar = Join-Path $sdkRoot "canton\canton.jar"

daml build --all
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

java -jar $cantonJar run canton/bootstrap.canton `
    -c canton/remote-console.conf `
    --no-tty
