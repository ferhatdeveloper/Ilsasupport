# ILSA Support — GitHub'dan çekip site + API'yi günceller.
# Kullanım: .\scripts\deploy-from-git.ps1 [-Branch main]
param(
  [string]$Branch = 'main',
  [string]$RepoRoot = 'C:\ilsasupport'
)

$ErrorActionPreference = 'Stop'
Set-Location $RepoRoot

function Find-Git {
  $cmd = Get-Command git -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @(
    'C:\Program Files\Git\cmd\git.exe',
    'C:\Program Files\Git\bin\git.exe',
    'C:\Program Files (x86)\Git\cmd\git.exe'
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return $p }
  }
  throw 'git bulunamadı. Git for Windows kurun: https://git-scm.com/download/win'
}

$git = Find-Git
Write-Host "==> git fetch ($Branch)" -ForegroundColor Cyan
& $git fetch origin $Branch
& $git checkout $Branch 2>$null
if ($LASTEXITCODE -ne 0) { & $git checkout -B $Branch "origin/$Branch" }
& $git reset --hard "origin/$Branch"

if (Test-Path 'package.json') {
  if (Test-Path 'package-lock.json') {
    Write-Host '==> npm ci' -ForegroundColor Cyan
    npm ci --omit=dev 2>$null
    if ($LASTEXITCODE -ne 0) { npm install }
  } else {
    npm install
  }
  if (Select-String -Path 'package.json' -Pattern '"build"' -Quiet) {
    Write-Host '==> npm run build' -ForegroundColor Cyan
    npm run build
  }
}

# API servisi (NSSM / görev adı ortamınıza göre değiştirin)
$apiService = $env:ILSA_API_SERVICE_NAME
if ($apiService) {
  Write-Host "==> API yeniden başlatılıyor: $apiService" -ForegroundColor Cyan
  Restart-Service -Name $apiService -ErrorAction SilentlyContinue
}

Write-Host '==> Deploy tamamlandı' -ForegroundColor Green
