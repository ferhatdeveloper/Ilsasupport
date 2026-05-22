#Requires -RunAsAdministrator
#Requires -Version 5.1
<#
  Redis — Windows servisi (otomatik başlatma, 127.0.0.1:6379).
  İkili dosya: tools\redis (tporadowski/redis 5.0.14.1)

  Kurulum:
    powershell -ExecutionPolicy Bypass -File scripts\install-redis-service.ps1

  Kaldırma:
    redis-server --service-uninstall
    Remove-Service Redis -ErrorAction SilentlyContinue  # gerekirse
#>
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tools = Join-Path $root 'tools\redis'
$zip = Join-Path $env:TEMP 'Redis-x64-5.0.14.1.zip'
$url = 'https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip'
$redisExe = Join-Path $tools 'redis-server.exe'
$redisCli = Join-Path $tools 'redis-cli.exe'
$conf = Join-Path $tools 'redis.windows.conf'
$serviceName = 'Redis'
$displayName = 'ILSA Support Redis'

function Ensure-RedisBinary {
  if (Test-Path $redisExe) { return }
  New-Item -ItemType Directory -Force -Path $tools | Out-Null
  if (-not (Test-Path $zip)) {
    Write-Host '==> Redis indiriliyor...' -ForegroundColor Cyan
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  }
  $extract = Join-Path $env:TEMP 'redis-extract'
  if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $extract -Force
  $src = $extract
  $nested = Get-ChildItem $extract -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($nested -and (Test-Path (Join-Path $nested.FullName 'redis-server.exe'))) {
    $src = $nested.FullName
  }
  Get-ChildItem $src -Force | Copy-Item -Destination $tools -Recurse -Force
  Write-Host "[OK] Redis dosyalari: $tools" -ForegroundColor Green
}

function Stop-ForegroundRedis {
  Get-NetTCPConnection -LocalPort 6379 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object {
      $p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
      if ($p -and $p.ProcessName -eq 'redis-server') {
        $svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        if (-not $svc -or $svc.Status -ne 'Running' -or $p.Id -ne (Get-WmiObject Win32_Service -Filter "Name='$serviceName'" -ErrorAction SilentlyContinue).ProcessId) {
          Write-Host "==> Arka plan redis-server durduruluyor (PID $($p.Id))" -ForegroundColor Yellow
          Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
      }
    }
  Start-Sleep -Seconds 2
}

Ensure-RedisBinary
if (-not (Test-Path $conf)) { throw "Yapilandirma yok: $conf" }

$svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if (-not $svc) {
  Write-Host '==> Redis Windows servisi kuruluyor...' -ForegroundColor Cyan
  & $redisExe --service-install $conf
  if ($LASTEXITCODE -ne 0) { throw 'redis-server --service-install basarisiz' }
} else {
  Write-Host '[OK] Redis servisi zaten kayitli' -ForegroundColor Green
}

sc.exe config $serviceName DisplayName= $displayName start= auto | Out-Null
Set-Service -Name $serviceName -StartupType Automatic -ErrorAction SilentlyContinue

Stop-ForegroundRedis

if ((Get-Service $serviceName).Status -ne 'Running') {
  Start-Service $serviceName
  Start-Sleep -Seconds 3
}

$status = (Get-Service $serviceName).Status
if ($status -ne 'Running') { throw "Redis servisi calismiyor: $status" }

$ping = & $redisCli ping 2>&1
if ($ping -notmatch 'PONG') { throw "redis-cli ping basarisiz: $ping" }

Write-Host "[OK] $displayName - servis: $status, 127.0.0.1:6379, yanit: $ping" -ForegroundColor Green
