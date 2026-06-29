# Deprecated wrapper. Use .\scripts\local\run-multinode-lifecycle.ps1.

Write-Host "[deprecated] run-multinode-demo.ps1 -> run-multinode-lifecycle.ps1"
& (Join-Path $PSScriptRoot "run-multinode-lifecycle.ps1") @args
