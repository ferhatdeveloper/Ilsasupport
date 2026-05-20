#Requires -RunAsAdministrator
<#
  Geliştirme: Vite varsayılan 80 (alternatif 5173) ve yerel API (8787) için Windows Güvenlik Duvarı gelen kuralları.
  Sunucuda (194.62.52.140 / ilsasupport.com) tarayıcıdan erişim yoksa bu betiği YÖNETİCİ PowerShell'de çalıştırın:
    cd C:\yol\testt
    powershell -ExecutionPolicy Bypass -File .\scripts\open-dev-ports-windows.ps1
#>
$ErrorActionPreference = 'Stop'

function Ensure-Rule {
  param(
    [string]$DisplayName,
    [int]$Port
  )
  $existing = Get-NetFirewallRule -DisplayName $DisplayName -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "[OK] Zaten var: $DisplayName"
    return
  }
  New-NetFirewallRule `
    -DisplayName $DisplayName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port `
    -Profile Any `
    | Out-Null
  Write-Host "[+] Olusturuldu: $DisplayName (TCP $Port)"
}

Write-Host "ILSA Support - gelistirme portlari (Yonetici gerekli)"
Ensure-Rule -DisplayName 'ILSA Support - Vite dev (TCP 80)' -Port 80
Ensure-Rule -DisplayName 'ILSA Support - Vite dev alternatif (TCP 5173)' -Port 5173
Ensure-Rule -DisplayName 'ILSA Support - API Deno (TCP 8787)' -Port 8787
Write-Host ""
Write-Host "Sonra proje kokunde: npm run dev   veya   npm run dev:full"
Write-Host "Tarayici: http://SUNUCU_IP/   (VITE_DEV_PORT=5173 ise :5173)"
