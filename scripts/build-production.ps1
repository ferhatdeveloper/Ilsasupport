<#
  Üretim build — https://ilsasupport.com
  Node/npm PATH'te olmali veya: npm install sonrasi node_modules\.bin\vite
#>
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $projectRoot

$env:VITE_PUBLIC_SITE_URL = 'https://ilsasupport.com'
$env:ILSA_PRODUCTION = 'true'
$env:VITE_REQUIRE_ELECTRON_LOGIN = 'true'

$nodeDir = Join-Path $projectRoot 'tools\node-build\node-v20.18.1-win-x64'
$npxCmd = Join-Path $nodeDir 'npx.cmd'
if (-not (Test-Path $npxCmd)) {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host 'npm bulunamadi — tools\node-build veya Node.js PATH gerekli.' -ForegroundColor Red
    exit 1
  }
  $npxCmd = 'npx'
} else {
  $env:Path = "$nodeDir;" + $env:Path
}

$staging = Join-Path $projectRoot 'build-staging'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue }
& $npxCmd vite build --outDir build-staging
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$buildDir = Join-Path $projectRoot 'build'
Get-ChildItem $staging -Force | Where-Object { $_.Name -ne 'downloads' } | ForEach-Object {
  $dest = Join-Path $buildDir $_.Name
  if ($_.PSIsContainer) {
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue }
    Copy-Item $_.FullName $dest -Recurse -Force
  } else {
    Copy-Item $_.FullName $dest -Force
  }
}
Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue

$portableName = 'ILSA-Support-Portable-1.0.2.exe'
$portableCandidates = @(
  (Join-Path $projectRoot "electron-client\release-1.0.2\$portableName"),
  (Join-Path $projectRoot "electron-client\release-1.0.1\ILSA-Support-Portable-1.0.1.exe"),
  (Join-Path $projectRoot "electron-client\release-2026-05-19\ILSA-Support-Portable-1.0.0.exe"),
  (Join-Path $projectRoot "electron-client\release-fresh-2026-05-18\ILSA-Support-Portable-1.0.0.exe"),
  (Join-Path $projectRoot "electron-client\release-portable-2026-05\ILSA-Support-Portable-1.0.0.exe"),
  (Join-Path $projectRoot "electron-client\release\$portableName"),
  (Join-Path $projectRoot "electron-client\release-build\$portableName")
)
$portableSrc = $portableCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (Test-Path $portableSrc) {
  $dlPublic = Join-Path $projectRoot 'public\downloads'
  $dlBuild = Join-Path $projectRoot 'build\downloads'
  New-Item -ItemType Directory -Force -Path $dlPublic, $dlBuild | Out-Null
  Copy-Item $portableSrc (Join-Path $dlPublic $portableName) -Force
  Copy-Item $portableSrc (Join-Path $dlBuild $portableName) -Force
  Write-Host "[OK] Portable: /downloads/$portableName"
} else {
  Write-Host '[UYARI] Portable exe yok — once scripts\build-electron-exe.ps1 calistirin' -ForegroundColor Yellow
}

Write-Host '[OK] build/ guncellendi — Caddy otomatik sunar (yeniden baslatma gerekmez)'
