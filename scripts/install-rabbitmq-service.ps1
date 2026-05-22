#Requires -RunAsAdministrator
#Requires -Version 5.1
<#
  RabbitMQ + Erlang — Windows servisi (5672, guest/guest).
  powershell -ExecutionPolicy Bypass -File scripts\install-rabbitmq-service.ps1
#>
$ErrorActionPreference = 'Stop'
$tools = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'tools\rabbitmq'
New-Item -ItemType Directory -Force -Path $tools | Out-Null

$erlangExe = Join-Path $tools 'otp_win64_26.2.5.exe'
$rabbitExe = Join-Path $tools 'rabbitmq-server-3.13.7.exe'
$erlangUrl = 'https://github.com/erlang/otp/releases/download/OTP-26.2.5/otp_win64_26.2.5.exe'
$rabbitUrl = 'https://github.com/rabbitmq/rabbitmq-server/releases/download/v3.13.7/rabbitmq-server-3.13.7.exe'

function Ensure-Download($url, $dest) {
  if (Test-Path $dest) { return }
  Write-Host "==> Indiriliyor: $dest" -ForegroundColor Cyan
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
}

$listen5672 = (Test-NetConnection 127.0.0.1 -Port 5672 -WarningAction SilentlyContinue).TcpTestSucceeded
$svc = Get-Service -Name 'RabbitMQ' -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running' -and $listen5672) {
  Write-Host '[OK] RabbitMQ zaten calisiyor (5672)' -ForegroundColor Green
  exit 0
}

if (-not $svc) {
  Ensure-Download $erlangUrl $erlangExe
  Ensure-Download $rabbitUrl $rabbitExe
  Write-Host '==> Erlang kuruluyor (sessiz)...' -ForegroundColor Cyan
  $p = Start-Process -FilePath $erlangExe -ArgumentList '/S' -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "Erlang kurulumu basarisiz: $($p.ExitCode)" }
  Write-Host '==> RabbitMQ kuruluyor (sessiz)...' -ForegroundColor Cyan
  $p2 = Start-Process -FilePath $rabbitExe -ArgumentList '/S' -Wait -PassThru
  if ($p2.ExitCode -ne 0) { throw "RabbitMQ kurulumu basarisiz: $($p2.ExitCode)" }
  Start-Sleep -Seconds 5
}

$rabbitHome = 'C:\Program Files\RabbitMQ Server\rabbitmq_server-3.13.7'
if (-not (Test-Path $rabbitHome)) {
  $rabbitHome = (Get-ChildItem 'C:\Program Files\RabbitMQ Server' -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | Select-Object -First 1).FullName
}
if (-not $rabbitHome) { throw 'RabbitMQ Server klasoru bulunamadi' }

$sbin = Join-Path $rabbitHome 'sbin'
$env:Path = "$sbin;" + $env:Path

$pluginJob = Start-Job { & rabbitmq-plugins.bat enable rabbitmq_management 2>&1 }
Wait-Job $pluginJob -Timeout 120 | Out-Null
Remove-Job $pluginJob -Force -ErrorAction SilentlyContinue

Set-Service -Name RabbitMQ -StartupType Automatic -ErrorAction SilentlyContinue
if ((Get-Service RabbitMQ).Status -ne 'Running') {
  Start-Service RabbitMQ
  Start-Sleep -Seconds 8
}

$listen = Test-NetConnection 127.0.0.1 -Port 5672 -WarningAction SilentlyContinue
if (-not $listen.TcpTestSucceeded) {
  & rabbitmq-service.bat start 2>&1
  Start-Sleep -Seconds 8
}

$ok = (Test-NetConnection 127.0.0.1 -Port 5672 -WarningAction SilentlyContinue).TcpTestSucceeded
if (-not $ok) { throw 'RabbitMQ 5672 dinlemiyor' }

Write-Host '[OK] RabbitMQ servisi - 127.0.0.1:5672 (amqp://guest:guest@127.0.0.1:5672/)' -ForegroundColor Green
Write-Host '[OK] Yonetim: http://127.0.0.1:15672 (guest/guest)' -ForegroundColor Green
