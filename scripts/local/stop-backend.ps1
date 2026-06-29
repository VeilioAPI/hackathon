# Stop Node.js processes holding the Veilio backend port (3001).
$ports = @(3001)

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
    Write-Host "No backend process found on port 3001."
    exit 0
}

foreach ($processId in $processIds) {
    $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($proc -and ($proc.ProcessName -eq "node" -or $proc.ProcessName -eq "tsx")) {
        Write-Host "Stopping PID $processId ($($proc.ProcessName))..."
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
}

Start-Sleep -Seconds 1
Write-Host "Port 3001 cleared."
