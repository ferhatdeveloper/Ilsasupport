#Requires -Version 5.1
<#
  Redis kurulumu — Windows servisi olarak (on planda process yok).
  powershell -ExecutionPolicy Bypass -File scripts\install-redis-windows.ps1
#>
$script = Join-Path $PSScriptRoot 'install-redis-service.ps1'
& powershell -ExecutionPolicy Bypass -File $script @args
