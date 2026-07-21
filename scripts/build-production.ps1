#Requires -Version 5.1
<#
  Üretim build: assets + index yenilenir; build/downloads (portable exe) korunur.
  powershell -ExecutionPolicy Bypass -File scripts\build-production.ps1
#>
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

$nodeCandidates = @(
  'C:\Program Files\nodejs\node.exe',
  'c:\Users\Administrator\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe'
)
$node = $nodeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $node) { throw 'node.exe bulunamadi' }
$vite = Join-Path $root 'node_modules\vite\bin\vite.js'
if (-not (Test-Path $vite)) { throw "vite bulunamadi: $vite" }

$assets = Join-Path $root 'build\assets'
$index = Join-Path $root 'build\index.html'
if (Test-Path $assets) { Remove-Item $assets -Recurse -Force }
if (Test-Path $index) { Remove-Item $index -Force }

Write-Host '==> vite build' -ForegroundColor Cyan
& $node $vite build 2>&1 | ForEach-Object { Write-Host $_ }
$built = Get-ChildItem (Join-Path $root 'build\assets') -Filter 'index-*.js' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $built) { throw 'build/assets/index-*.js olusmadi' }
Write-Host '[OK] build tamam' -ForegroundColor Green
