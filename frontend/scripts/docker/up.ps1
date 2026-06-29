# Build and start the full Veilio Exchange Docker stack.
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
Set-Location $repoRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
    exit 1
}

Write-Host "Building and starting Veilio Exchange (postgres + canton + backend + frontend)..."
docker compose up --build -d

Write-Host ""
Write-Host "Services:"
Write-Host "  Frontend:  http://localhost:3000"
Write-Host "  Backend:   http://localhost:3001/api/health"
Write-Host "  Canton A:  localhost:5011 (ledger), :5013 (JSON API)"
Write-Host "  Canton B:  localhost:5021 (ledger), :5023 (JSON API)"
Write-Host ""
Write-Host "Logs: docker compose logs -f"
Write-Host "Stop: docker compose down"
