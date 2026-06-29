# Start Veilio backend API (Deliverable 3).
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
Set-Location (Join-Path $repoRoot "backend")

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created backend/.env - run ..\scripts\local\setup-postgres.cmd if DB not initialized"
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm not found. Install Node.js 20+."
    exit 1
}

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing backend dependencies..."
    npm install
}

Write-Host "Starting backend on http://localhost:3001"
npm run dev
