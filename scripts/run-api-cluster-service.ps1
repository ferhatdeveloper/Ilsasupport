#Requires -Version 5.1
<#
  WinSW / servis icin API kumesi — 2 Deno worker (8787-8788), cikis yapilmaz (ust process canli kalir).
#>
param(
  [int]$Workers = 4,
  [int]$BasePort = 8787
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$deno = Join-Path $root 'tools\deno\deno.exe'
if (-not (Test-Path $deno)) {
  $deno = Join-Path $env:USERPROFILE '.deno\bin\deno.exe'
}
if (-not (Test-Path $deno)) { throw "Deno yok: $deno" }
if (-not (Test-Path (Join-Path $root '.env.local'))) { throw '.env.local yok' }

$ports = $BasePort..($BasePort + $Workers - 1)
$script:children = New-Object System.Collections.ArrayList

function Stop-Workers {
  foreach ($p in @($script:children)) {
    if ($p -and -not $p.HasExited) {
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    }
  }
  [void]$script:children.Clear()
}

function Start-Workers {
  Stop-Workers
  foreach ($port in $ports) {
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
    [void]$script:children.Add($proc)
    Write-Host "[cluster] worker PID $($proc.Id) port $port"
  }
}

trap {
  Stop-Workers
  break
}

Start-Workers

while ($true) {
  Start-Sleep -Seconds 15
  $dead = @($script:children) | Where-Object { $_.HasExited }
  if ($dead) {
    Write-Host "[cluster] $($dead.Count) worker durdu, yeniden baslatiliyor..."
    Start-Workers
  }
}
