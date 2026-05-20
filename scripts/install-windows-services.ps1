#Requires -RunAsAdministrator
<#
  ILSA Support — Caddy + API Windows servisleri (WinSW).
  Otomatik baslatma, cokme sonrasi yeniden baslatma.

  Kurulum:
    powershell -ExecutionPolicy Bypass -File scripts\install-windows-services.ps1

  Kaldirma:
    powershell -ExecutionPolicy Bypass -File scripts\uninstall-windows-services.ps1
#>
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot

$servicesDir = Join-Path $projectRoot 'deploy\services'
$logDir = Join-Path $projectRoot 'deploy\logs'
$winswSrc = Join-Path $projectRoot 'tools\winsw\WinSW-x64.exe'
$winswUrl = 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe'
$caddyExe = Join-Path $projectRoot 'tools\caddy\caddy.exe'
$caddyfile = Join-Path $projectRoot 'deploy\Caddyfile'
$denoUser = Join-Path $env:USERPROFILE '.deno\bin\deno.exe'
$denoExe = Join-Path $projectRoot 'tools\deno\deno.exe'
$envFile = Join-Path $projectRoot '.env.local'

New-Item -ItemType Directory -Force -Path $logDir, $servicesDir | Out-Null

function Stop-ILSAProcesses {
  foreach ($n in @('caddy', 'deno')) {
    Get-Process -Name $n -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
}

function Remove-ILSATasks {
  foreach ($t in @('ILSA-Support-Caddy', 'ILSA-Support-API')) {
    Unregister-ScheduledTask -TaskName $t -Confirm:$false -ErrorAction SilentlyContinue
  }
}

function Ensure-WinSW {
  if (Test-Path $winswSrc) { return }
  New-Item -ItemType Directory -Force -Path (Split-Path $winswSrc -Parent) | Out-Null
  Write-Host "Indiriliyor: $winswUrl"
  Invoke-WebRequest -Uri $winswUrl -OutFile $winswSrc -UseBasicParsing
  Write-Host "[OK] WinSW: $winswSrc"
}

function Install-WinSWService {
  param([string]$ServiceId)
  $xmlSrc = Join-Path $servicesDir "$ServiceId.xml"
  $wrapper = Join-Path $servicesDir "$ServiceId.exe"
  if (-not (Test-Path $xmlSrc)) { throw "XML yok: $xmlSrc" }

  $svc = Get-Service -Name $ServiceId -ErrorAction SilentlyContinue
  if ($svc) {
    if ($svc.Status -eq 'Running') {
      & $wrapper stop 2>&1 | Out-Null
      Start-Sleep -Seconds 2
    }
    & $wrapper uninstall 2>&1 | Out-Null
    Start-Sleep -Seconds 1
  }

  Copy-Item $winswSrc $wrapper -Force
  & $wrapper install
  if ($LASTEXITCODE -ne 0) { throw "WinSW install basarisiz: $ServiceId" }
  Write-Host "[OK] Servis kuruldu: $ServiceId"
}

# On kosullar
if (-not (Test-Path $caddyExe)) { & (Join-Path $PSScriptRoot 'install-caddy.ps1') }
if (-not (Test-Path $denoUser)) { throw "Deno yok: $denoUser" }
New-Item -ItemType Directory -Force -Path (Split-Path $denoExe -Parent) | Out-Null
Copy-Item $denoUser $denoExe -Force
if (-not (Test-Path $envFile)) { throw ".env.local yok" }

$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $caddyExe validate --config $caddyfile --adapter caddyfile 2>&1 | Out-Null
$ErrorActionPreference = $prevEap
if ($LASTEXITCODE -ne 0) { throw 'Caddyfile gecersiz' }

Ensure-WinSW
Stop-ILSAProcesses
Remove-ILSATasks

Install-WinSWService -ServiceId 'ILSA-Support-API'
Install-WinSWService -ServiceId 'ILSA-Support-Caddy'

Start-Service ILSA-Support-API
Start-Sleep -Seconds 4
Start-Service ILSA-Support-Caddy
Start-Sleep -Seconds 3

Get-Service ILSA-Support-API, ILSA-Support-Caddy | Format-Table Name, Status, StartType
Write-Host ''
Write-Host 'Loglar: deploy\logs\'
Write-Host 'Yonetim: services.msc'
Write-Host 'Site: https://ilsasupport.com'
