<#
  Sunucuda calistirin: Vite (80) ve API (8787) dinleniyor mu, dis IP ile erisim icin ne eksik.
  Ornek: powershell -ExecutionPolicy Bypass -File .\scripts\diagnose-remote-dev.ps1 -PublicIp 194.62.52.140
#>
param(
  [string]$PublicIp = ''
)

$ErrorActionPreference = 'Continue'

Write-Host "=== IIS / W3SVC (80'i genelde kilitler) ===" -ForegroundColor Cyan
try {
  $w3 = Get-Service W3SVC -ErrorAction SilentlyContinue
  if ($w3) {
    Write-Host "W3SVC durumu:" $w3.Status
    if ($w3.Status -eq 'Running') {
      Write-Host "-> Vite 80'de acilmiyorsa: net stop w3svc (veya IIS'te siteyi durdurun)" -ForegroundColor Yellow
    }
  } else {
    Write-Host "W3SVC servisi yok (IIS kurulu degil olabilir)."
  }
} catch {
  Write-Host $_.Exception.Message
}

Write-Host "`n=== TCP 80 / 8787 dinleyen adresler (0.0.0.0 veya * olmali; yalnizca 127.0.0.1 ise disaridan gelmez) ===" -ForegroundColor Cyan
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -eq 80 -or $_.LocalPort -eq 8787 } |
  Select-Object LocalAddress, LocalPort, OwningProcess |
  Sort-Object LocalPort, LocalAddress |
  Format-Table -AutoSize

Write-Host "=== Gelen kurallar: adinda 80 veya ILSA gecen (ozet) ===" -ForegroundColor Cyan
Get-NetFirewallRule -ErrorAction SilentlyContinue |
  Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' -and ($_.DisplayName -match '80|ILSA|Vite|8787') } |
  Select-Object -First 15 DisplayName, Enabled, Direction |
  Format-Table -AutoSize

Write-Host "`n=== Yerel HTTP: http://127.0.0.1/ ===" -ForegroundColor Cyan
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1/' -UseBasicParsing -TimeoutSec 5
  Write-Host "Status:" $r.StatusCode "Length:" $r.RawContentLength
} catch {
  Write-Host "HATA:" $_.Exception.Message -ForegroundColor Red
  Write-Host "-> Vite calismiyor olabilir (yönetici ile): npm run dev veya npm run dev:full" -ForegroundColor Yellow
}

Write-Host "`n=== Yerel API: http://127.0.0.1:8787/make-server-47081311/brands ===" -ForegroundColor Cyan
try {
  $r2 = Invoke-WebRequest -Uri 'http://127.0.0.1:8787/make-server-47081311/brands' -UseBasicParsing -TimeoutSec 5
  Write-Host "Status:" $r2.StatusCode
  Write-Host ($r2.Content.Substring(0, [Math]::Min(200, $r2.Content.Length)))
} catch {
  Write-Host "HATA:" $_.Exception.Message -ForegroundColor Red
  Write-Host "-> API calismiyor: npm run api veya npm run dev:full" -ForegroundColor Yellow
}

if ($PublicIp) {
  Write-Host "`n=== Hairpin (sunucudan kendi public IP): http://${PublicIp}/ ===" -ForegroundColor Cyan
  try {
    $r3 = Invoke-WebRequest -Uri "http://${PublicIp}/" -UseBasicParsing -TimeoutSec 8
    Write-Host "Status:" $r3.StatusCode
  } catch {
    Write-Host "HATA:" $_.Exception.Message -ForegroundColor Red
    Write-Host "-> Bazi aglarda kendi public IP'nize HTTP yasaktir; baska PC veya telefon verisinden deneyin." -ForegroundColor Yellow
  }

  Write-Host "`n=== Uzak baglanti testi (TCP 80): Test-NetConnection -ComputerName $PublicIp -Port 80 ===" -ForegroundColor Cyan
  try {
    $t = Test-NetConnection -ComputerName $PublicIp -Port 80 -WarningAction SilentlyContinue
    Write-Host "TcpTestSucceeded:" $t.TcpTestSucceeded
  } catch {
    Write-Host $_.Exception.Message
  }
}

Write-Host "`n=== Kontrol listesi (dis IP ile http://194.x.x.x/ ) ===" -ForegroundColor Green
Write-Host "1) npm run dev veya dev:full calissin; konsolda 'Network: http://...' URL'sine bakin."
Write-Host "2) Windows: Vite 80 icin genelde YONETICI PowerShell gerekir."
Write-Host "3) npm run windows:firewall-dev (yonetici) veya bulutta guvenlik grubunda TCP 80 acik olsun."
Write-Host "4) 80 baskasi tarafindan kullaniliyorsa: net stop w3svc veya VITE_DEV_PORT=5173 + o portu acin."
Write-Host "`nBitti."
