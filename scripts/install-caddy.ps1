#Requires -Version 5.1
<#
  Caddy (Windows amd64) indirir: tools/caddy/caddy.exe
  Yönetici PowerShell gerekmez; kurulum için kullanın.
#>
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$installDir = Join-Path $projectRoot 'tools\caddy'
$exe = Join-Path $installDir 'caddy.exe'

if (Test-Path $exe) {
  Write-Host "[OK] Zaten kurulu: $exe"
  & $exe version
  exit 0
}

New-Item -ItemType Directory -Force -Path $installDir | Out-Null

$version = '2.9.1'
$zipName = "caddy_${version}_windows_amd64.zip"
$url = "https://github.com/caddyserver/caddy/releases/download/v${version}/$zipName"
$zipPath = Join-Path $env:TEMP $zipName

Write-Host "Indiriliyor: $url"
Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing

$extract = Join-Path $env:TEMP "caddy-extract-$version"
if (Test-Path $extract) { Remove-Item -Recurse -Force $extract }
Expand-Archive -Path $zipPath -DestinationPath $extract -Force

$bin = Get-ChildItem -Path $extract -Filter 'caddy.exe' -Recurse | Select-Object -First 1
if (-not $bin) { throw 'caddy.exe arsivde bulunamadi' }
Copy-Item -LiteralPath $bin.FullName -Destination $exe -Force
Remove-Item -Recurse -Force $extract -ErrorAction SilentlyContinue
Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

Write-Host "[OK] Kuruldu: $exe"
& $exe version
