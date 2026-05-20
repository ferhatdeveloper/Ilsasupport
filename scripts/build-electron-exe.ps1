#Requires -RunAsAdministrator
<#
  ILSA Support masaüstü — Windows .exe (NSIS kurulum)
  powershell -ExecutionPolicy Bypass -File scripts\build-electron-exe.ps1
#>
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$electronDir = Join-Path $projectRoot 'electron-client'
$nodeDir = Join-Path $projectRoot 'tools\node-build'
$nodeZip = Join-Path $nodeDir 'node.zip'
$nodeExe = Join-Path $nodeDir 'node-v20.18.1-win-x64\node.exe'
$npmCmd = Join-Path $nodeDir 'node-v20.18.1-win-x64\npm.cmd'

function Ensure-Node {
  if (Get-Command npm -ErrorAction SilentlyContinue) {
    return (Get-Command npm).Source
  }
  if (Test-Path $npmCmd) { return $npmCmd }
  New-Item -ItemType Directory -Force -Path $nodeDir | Out-Null
  if (-not (Test-Path $nodeZip)) {
    $url = 'https://nodejs.org/dist/v20.18.1/node-v20.18.1-win-x64.zip'
    Write-Host "Indiriliyor: $url"
    Invoke-WebRequest -Uri $url -OutFile $nodeZip -UseBasicParsing
  }
  if (-not (Test-Path $nodeExe)) {
    Expand-Archive -Path $nodeZip -DestinationPath $nodeDir -Force
  }
  if (-not (Test-Path $npmCmd)) { throw "npm bulunamadi: $npmCmd" }
  return $npmCmd
}

$iconSrc = Join-Path $projectRoot 'build\logo2026.png'
if (-not (Test-Path $iconSrc)) { $iconSrc = Join-Path $projectRoot 'public\logo2026.png' }
$logoDst = Join-Path $electronDir 'renderer\assets\logo.png'
New-Item -ItemType Directory -Force -Path (Split-Path $logoDst -Parent) | Out-Null
Copy-Item $iconSrc $logoDst -Force

$npm = Ensure-Node
Set-Location $electronDir

Write-Host 'npm install...'
& $npm install 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'electron-builder (NSIS)...'
& $npm run dist 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$pkg = Get-Content (Join-Path $electronDir 'package.json') -Raw | ConvertFrom-Json
$ver = $pkg.version
$out = Join-Path $electronDir "release-$ver"
Write-Host ''
Write-Host "[OK] Cikti: $out"
Get-ChildItem $out -Filter *.exe -Recurse | ForEach-Object { Write-Host "  $($_.FullName)" }
