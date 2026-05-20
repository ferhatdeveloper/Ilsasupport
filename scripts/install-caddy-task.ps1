#Requires -RunAsAdministrator
<#
  Caddy + API'yi Windows görev zamanlayıcıda otomatik başlatır (sunucu açılışı).
  powershell -ExecutionPolicy Bypass -File scripts\install-caddy-task.ps1
#>
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$starter = Join-Path $projectRoot 'scripts\start-caddy-production.ps1'
$taskName = 'ILSA-Support-Caddy'

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$starter`" -Background"

$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
Write-Host "[OK] Gorev: $taskName (sistem acilisinda)"
