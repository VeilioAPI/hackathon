# Stop Canton processes holding Veilio multinode or default sandbox ports.
$ports = @(5001, 5002, 5011, 5012, 5013, 5021, 5022, 5023, 5202, 6865, 6866, 6867, 6868, 6869, 7575)

$processIds = @()
foreach ($port in $ports) {
    $matches = netstat -ano | Select-String ":$port\s"
    foreach ($line in $matches) {
        $processId = ($line -split '\s+')[-1]
        if ($processId -match '^\d+$') { $processIds += [int]$processId }
    }
}

$processIds = $processIds | Sort-Object -Unique
if ($processIds.Count -eq 0) {
    Write-Host "No Canton processes found on Veilio ports."
    exit 0
}

foreach ($processId in $processIds) {
    $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq "java") {
        Write-Host "Stopping Java PID $processId (Canton)..."
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
}

Start-Sleep -Seconds 2
Write-Host "Canton ports cleared."
