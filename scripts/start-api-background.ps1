#Requires -RunAsAdministrator
<#
  Deno API (8787) arka planda — .env.local gerekli.
  powershell -ExecutionPolicy Bypass -File scripts\start-api-background.ps1
#>
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$denoExe = Join-Path $env:USERPROFILE '.deno\bin\deno.exe'
$envFile = Join-Path $projectRoot '.env.local'

if (-not (Test-Path $denoExe)) { throw "Deno yok: $denoExe" }
if (-not (Test-Path $envFile)) { throw ".env.local yok" }

$listen = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
if ($listen) {
  Write-Host '[OK] API zaten dinliyor (8787)'
  exit 0
}

Start-Process -FilePath $denoExe `
  -ArgumentList 'run', '-A', '--env-file=.env.local', 'src/supabase/functions/server/index.tsx' `
  -WorkingDirectory $projectRoot -WindowStyle Hidden
Start-Sleep -Seconds 3
Write-Host '[OK] API baslatildi (8787)'
