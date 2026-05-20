#Requires -Version 5.1
<#
  Windows: TCP 80 icin Vite genelde yonetici gerekir. Bu betik yoksa UAC ile yeniden baslatir.
  Kullanim (proje kokunden):
    npm run dev:admin          -> yalniz Vite
    npm run dev:full:admin     -> API + Vite (concurrently)
#>
param(
  [switch]$Full
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Test-IsAdmin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
  Write-Host 'Port 80 icin yonetici gerekli. UAC ile yeni pencere aciliyor...' -ForegroundColor Yellow
  $argList = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', (Join-Path $PSScriptRoot 'run-dev-elevated.ps1')
  )
  if ($Full) { $argList += '-Full' }
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -WorkingDirectory $projectRoot -ArgumentList $argList | Out-Null
  exit 0
}

Set-Location -LiteralPath $projectRoot
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host 'HATA: npm PATH''te yok. Node.js kurulu ve PATH ayarli olmali.' -ForegroundColor Red
  exit 1
}
if ($Full) {
  npm run dev:full
} else {
  npm run dev
}
