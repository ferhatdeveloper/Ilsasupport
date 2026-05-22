# Portable EXE derler, ZIP ve SHA256 oluşturur, site indirme klasörlerine kopyalar.
param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$Version = '1.0.3'
)

$ErrorActionPreference = 'Stop'
$node = @(
  'C:\Program Files\nodejs\node.exe',
  "$env:LOCALAPPDATA\Programs\cursor\resources\app\resources\helpers\node.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $node) { throw 'node.exe bulunamadi' }

$electronDir = Join-Path $ProjectRoot 'electron-client'
$outDir = Join-Path $electronDir "release-package-$Version"
$exeName = "ILSA-Support-Portable-$Version.exe"
$zipName = "ILSA-Support-Portable-$Version.zip"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

$pkgPath = Join-Path $electronDir 'package.json'
$pkgRaw = Get-Content $pkgPath -Raw -Encoding UTF8
$pkg = $pkgRaw | ConvertFrom-Json
$origOut = $pkg.build.directories.output
$pkg.build.directories.output = "release-package-$Version"
Write-Utf8NoBom $pkgPath ($pkg | ConvertTo-Json -Depth 20)

try {
  Set-Location $electronDir
  & $node .\node_modules\electron-builder\cli.js --win portable --x64
} finally {
  $pkg.build.directories.output = $origOut
  Write-Utf8NoBom $pkgPath ($pkg | ConvertTo-Json -Depth 20)
}

$exePath = Join-Path $outDir $exeName
if (-not (Test-Path $exePath)) { throw "Derleme basarisiz: $exePath" }

$zipPath = Join-Path $outDir $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path $exePath -DestinationPath $zipPath -CompressionLevel Optimal

$hash = (Get-FileHash $exePath -Algorithm SHA256).Hash
$hashLine = "$hash  $exeName"
$hashFile = Join-Path $outDir "$exeName.sha256.txt"
Set-Content -Path $hashFile -Value $hashLine -Encoding ASCII

foreach ($dest in @(
  (Join-Path $ProjectRoot 'public\downloads'),
  (Join-Path $ProjectRoot 'build\downloads')
)) {
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item $exePath (Join-Path $dest $exeName) -Force
  Copy-Item $zipPath (Join-Path $dest $zipName) -Force
  Copy-Item $hashFile (Join-Path $dest "$exeName.sha256.txt") -Force
}

Write-Host "[OK] $exePath" -ForegroundColor Green
Write-Host "[OK] $zipPath" -ForegroundColor Green
Write-Host "SHA256: $hash"
