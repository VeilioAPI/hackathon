# Create Veilio PostgreSQL database and run migrations.
$ErrorActionPreference = "Stop"

$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
if (-not (Test-Path $psql)) {
    Write-Error "psql not found. Install PostgreSQL 16 or update the path in this script."
    exit 1
}

$env:PGPASSWORD = "veilio"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
Set-Location (Join-Path $repoRoot "backend")

$exists = & $psql -U postgres -h localhost -p 5432 -tc "SELECT 1 FROM pg_database WHERE datname = 'veilio_exchange'"
if (-not ($exists -match "1")) {
    Write-Host "Creating database veilio_exchange..."
    & $psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE veilio_exchange;"
}

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created backend/.env"
}

Write-Host "Running migrations..."
npm run db:migrate
Write-Host "PostgreSQL setup complete."
