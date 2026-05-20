#Requires -RunAsAdministrator
<#
  Sunucu acilisinda API + Caddy otomatik baslar.
  powershell -ExecutionPolicy Bypass -File scripts\install-production-tasks.ps1
#>
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Register-ILSATask {
  param([string]$Name, [string]$ScriptRel)
  $script = Join-Path $projectRoot $ScriptRel
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 0)
  Unregister-ScheduledTask -TaskName $Name -Confirm:$false -ErrorAction SilentlyContinue
  Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
  Write-Host "[OK] $Name"
}

Register-ILSATask -Name 'ILSA-Support-API' -ScriptRel 'scripts\start-api-background.ps1'
# Caddy: arka plan (bloklamayan)
$caddyStarter = Join-Path $projectRoot 'scripts\start-caddy-production.ps1'
$caddyAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$caddyStarter`" -Background"
$caddyTrigger = New-ScheduledTaskTrigger -AtStartup
$caddyPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$caddySettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 0)
Unregister-ScheduledTask -TaskName 'ILSA-Support-Caddy' -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName 'ILSA-Support-Caddy' -Action $caddyAction -Trigger $caddyTrigger -Principal $caddyPrincipal -Settings $caddySettings | Out-Null
Write-Host '[OK] ILSA-Support-Caddy'
Write-Host 'Tamam — yeniden baslatma sonrasi https://ilsasupport.com'
