#Requires -RunAsAdministrator
<#
  API + Caddy + (isteğe bağlı) üretim build yeniden başlatma.
  powershell -ExecutionPolicy Bypass -File scripts\restart-all.ps1
  powershell -ExecutionPolicy Bypass -File scripts\restart-all.ps1 -Build
#>
param([switch]$Build)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

if ($Build) {
  Write-Host '==> npm run build' -ForegroundColor Cyan
  npm run build
}

Write-Host '==> API yeniden başlatılıyor' -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort 8787 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
& (Join-Path $root 'scripts\start-api-background.ps1')

Write-Host '==> Caddy yeniden başlatılıyor' -ForegroundColor Cyan
& (Join-Path $root 'scripts\restart-caddy.ps1')

Write-Host '[OK] Yeniden başlatma tamamlandı' -ForegroundColor Green
