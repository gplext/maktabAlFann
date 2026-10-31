# Exports your local Maktaba database to maktaba.dump (project folder) for import into Coolify.
# Right-click this file -> "Run with PowerShell". Nothing is uploaded; the file stays on your PC.
$ErrorActionPreference = 'Stop'
try {
  Set-Location (Split-Path $PSScriptRoot -Parent)

  $line = Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  if (-not $line) { throw "DATABASE_URL not found in .env" }
  $url = ($line -replace '^DATABASE_URL=', '').Trim().Trim('"')

  if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    $pg = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory -ErrorAction SilentlyContinue |
          Sort-Object { [int]($_.Name -replace '\D', '') } -Descending | Select-Object -First 1
    if (-not $pg) { throw "pg_dump not found. Install PostgreSQL client tools or add its bin folder to PATH." }
    $env:Path += ";$($pg.FullName)\bin"
  }
  Write-Host "Using $((Get-Command pg_dump).Source)"

  foreach ($m in 'migration-06-frames.sql', 'migration-07-croc-leather-frame.sql') {
    Write-Host "Applying $m (safe to re-run)..."
    & psql $url -v ON_ERROR_STOP=1 -q -f "migrations/$m"
    if ($LASTEXITCODE -ne 0) { throw "$m failed" }
  }

  Write-Host "Exporting database..."
  & pg_dump --format=custom --no-owner --no-privileges -d $url -f maktaba.dump
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }

  $kb = [math]::Round((Get-Item maktaba.dump).Length / 1KB)
  Write-Host ""
  Write-Host "DONE: maktaba.dump created ($kb KB). Tell Claude 'export done'." -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
}
Read-Host "Press Enter to close"
