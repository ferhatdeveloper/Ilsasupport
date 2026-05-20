#Requires -RunAsAdministrator
<#
  Caddy'yi arka planda yeniden baslatir (config / sertifika degisikligi sonrasi).
  powershell -ExecutionPolicy Bypass -File scripts\restart-caddy.ps1
#>
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$caddyExe = Join-Path $projectRoot 'tools\caddy\caddy.exe'
$caddyfile = Join-Path $projectRoot 'deploy\Caddyfile'

Stop-Process -Name caddy -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$env:ILSA_ROOT = $projectRoot
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $caddyExe validate --config $caddyfile --adapter caddyfile 2>&1 | Out-Null
$validExit = $LASTEXITCODE
$ErrorActionPreference = $prevEap
if ($validExit -ne 0) { exit $validExit }

Start-Process -FilePath $caddyExe `
  -ArgumentList 'run', '--config', $caddyfile, '--adapter', 'caddyfile' `
  -WorkingDirectory $projectRoot -WindowStyle Hidden

Start-Sleep -Seconds 4
$listen = Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue
if ($listen) { Write-Host '[OK] Caddy 80/443 dinliyor' } else { Write-Host '[!] 443 henuz acik degil — loglari kontrol edin' -ForegroundColor Yellow }
