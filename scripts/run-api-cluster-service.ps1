#Requires -Version 5.1
<#
  ILSA Support API — Deno worker cluster (WinSW servisi).
  Tek cluster örneği; canlılık port dinlemesi ile kontrol edilir.
#>
param(
  [int]$Workers = 1,
  [int]$BasePort = 8787
)

$ErrorActionPreference = 'Continue'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$deno = Join-Path $root 'tools\deno\deno.exe'
if (-not (Test-Path $deno)) {
  $deno = Join-Path $env:USERPROFILE '.deno\bin\deno.exe'
}
if (-not (Test-Path $deno)) { throw "Deno yok: $deno" }
if (-not (Test-Path (Join-Path $root '.env.local'))) { throw '.env.local yok' }

# Aynı anda yalnızca bir cluster yöneticisi
$mutexName = 'Global\ILSA-Support-API-Cluster'
$script:clusterMutex = New-Object System.Threading.Mutex($false, $mutexName)
if (-not $script:clusterMutex.WaitOne(0, $false)) {
  Write-Host '[cluster] Baska cluster ornegi calisiyor, cikiliyor.'
  exit 0
}

$ports = @($BasePort..($BasePort + $Workers - 1))

function Test-PortListening([int]$port) {
  $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  return $listeners.Count -gt 0
}

function Stop-PortListener([int]$port) {
  $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  foreach ($l in $listeners) {
    $listenerPid = [int]$l.OwningProcess
    if ($listenerPid -gt 0) {
      Write-Host "[cluster] Port $port PID $listenerPid sonlandiriliyor"
      Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
    }
  }
}

function Wait-PortFree([int]$port, [int]$maxSec = 8) {
  for ($i = 0; $i -lt ($maxSec * 4); $i++) {
    if (-not (Test-PortListening $port)) { return $true }
    Start-Sleep -Milliseconds 250
  }
  return -not (Test-PortListening $port)
}

function Start-Worker([int]$port) {
  if (Test-PortListening $port) {
    return
  }
  Stop-PortListener $port
  Wait-PortFree $port | Out-Null

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $deno
  $psi.Arguments = 'run -A --env-file=.env.local src/supabase/functions/server/index.tsx'
  $psi.WorkingDirectory = $root
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  [void]$psi.EnvironmentVariables['PORT']
  $psi.EnvironmentVariables['PORT'] = "$port"
  $psi.EnvironmentVariables['ILSA_RUN_SCHEMA_ENSURE'] = if ($port -eq $BasePort) { '1' } else { '0' }
  $proc = [System.Diagnostics.Process]::Start($psi)
  Write-Host "[cluster] worker PID $($proc.Id) port $port"
  Start-Sleep -Milliseconds 800
}

foreach ($port in $ports) {
  Stop-PortListener $port
  Wait-PortFree $port | Out-Null
}

foreach ($port in $ports) {
  Start-Worker $port
}

while ($true) {
  Start-Sleep -Seconds 20
  foreach ($port in $ports) {
    if (-not (Test-PortListening $port)) {
      Write-Host "[cluster] Port $port kapali, worker baslatiliyor..."
      Start-Worker $port
    }
  }
}
