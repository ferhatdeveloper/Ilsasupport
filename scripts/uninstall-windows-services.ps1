#Requires -RunAsAdministrator
<#
  ILSA Windows servislerini kaldir (WinSW).
  powershell -ExecutionPolicy Bypass -File scripts\uninstall-windows-services.ps1
#>
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$servicesDir = Join-Path $projectRoot 'deploy\services'

foreach ($id in @('ILSA-Support-Caddy', 'ILSA-Support-API')) {
  $wrapper = Join-Path $servicesDir "$id.exe"
  $svc = Get-Service -Name $id -ErrorAction SilentlyContinue
  if ($svc -and (Test-Path $wrapper)) {
    if ($svc.Status -eq 'Running') {
      & $wrapper stop 2>&1 | Out-Null
      Start-Sleep -Seconds 2
    }
    & $wrapper uninstall 2>&1 | Out-Null
    Write-Host "[OK] Kaldirildi: $id"
  } elseif ($svc) {
    Stop-Service $id -Force -ErrorAction SilentlyContinue
    sc.exe delete $id | Out-Null
    Write-Host "[OK] Kaldirildi (sc): $id"
  }
}

Get-Process caddy, deno -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host 'Tamam.'
