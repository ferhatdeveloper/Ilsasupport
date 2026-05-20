#Requires -RunAsAdministrator
param([switch]$Background)

<#
  Üretim yığını: Deno API (8787) + Caddy (80/443) → statik build/

  Kullanım (proje kökü):
    powershell -ExecutionPolicy Bypass -File scripts\install-caddy.ps1
    powershell -ExecutionPolicy Bypass -File scripts\open-ports-caddy.ps1
    powershell -ExecutionPolicy Bypass -File scripts\start-caddy-production.ps1
    powershell -ExecutionPolicy Bypass -File scripts\start-caddy-production.ps1 -Background
#>
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot

$caddyExe = Join-Path $projectRoot 'tools\caddy\caddy.exe'
$caddyfile = Join-Path $projectRoot 'deploy\Caddyfile'
$buildIndex = Join-Path $projectRoot 'build\index.html'
$denoExe = Join-Path $env:USERPROFILE '.deno\bin\deno.exe'

if (-not (Test-Path $caddyExe)) {
  & (Join-Path $PSScriptRoot 'install-caddy.ps1')
}
if (-not (Test-Path $buildIndex)) {
  Write-Host 'build/ yok — once: npm run build (Node gerekli)' -ForegroundColor Yellow
}

# Port 80/443 — gelistirme Vite varsa durdur
foreach ($port in 80, 443) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -notmatch 'caddy') {
      Write-Host "Port $port bosaltiliyor: $($p.ProcessName) (PID $($p.Id))"
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 1
    }
  }
}

# API (8787)
$apiListen = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
if (-not $apiListen -and (Test-Path $denoExe) -and (Test-Path (Join-Path $projectRoot '.env.local'))) {
  Write-Host 'API baslatiliyor (8787)...'
  Start-Process -FilePath $denoExe -ArgumentList 'run', '-A', '--env-file=.env.local', 'src/supabase/functions/server/index.tsx' `
    -WorkingDirectory $projectRoot -WindowStyle Hidden
  Start-Sleep -Seconds 3
}

$env:ILSA_ROOT = $projectRoot
$dataDir = Join-Path $projectRoot 'deploy\caddy-data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

Write-Host 'Caddy dogrulaniyor...'
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $caddyExe validate --config $caddyfile --adapter caddyfile 2>&1 | Out-Null
$validExit = $LASTEXITCODE
$ErrorActionPreference = $prevEap
if ($validExit -ne 0) { exit $validExit }

if ($Background) {
  Stop-Process -Name caddy -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  Start-Process -FilePath $caddyExe -ArgumentList 'run', '--config', $caddyfile, '--adapter', 'caddyfile' `
    -WorkingDirectory $projectRoot -WindowStyle Hidden
  Write-Host '[OK] Caddy arka planda — https://ilsasupport.com'
  exit 0
}

Write-Host ''
Write-Host 'Caddy calisiyor (Ctrl+C ile durdurun).'
Write-Host '  https://ilsasupport.com'
Write-Host ''

& $caddyExe run --config $caddyfile --adapter caddyfile --environ
