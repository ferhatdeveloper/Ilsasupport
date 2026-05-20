#Requires -RunAsAdministrator
<#
  HTTPS (443) ve HTTP (80) — Caddy / Let's Encrypt dogrulama
  powershell -ExecutionPolicy Bypass -File scripts\open-ports-caddy.ps1
#>
$ErrorActionPreference = 'Stop'

function Ensure-Rule {
  param([string]$DisplayName, [int]$Port)
  if (Get-NetFirewallRule -DisplayName $DisplayName -ErrorAction SilentlyContinue) {
    Write-Host "[OK] $DisplayName"
    return
  }
  New-NetFirewallRule -DisplayName $DisplayName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Any | Out-Null
  Write-Host "[+] $DisplayName (TCP $Port)"
}

Ensure-Rule -DisplayName 'ILSA Support - HTTP (TCP 80)' -Port 80
Ensure-Rule -DisplayName 'ILSA Support - HTTPS (TCP 443)' -Port 443
Write-Host 'Tamam.'
