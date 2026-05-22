#Requires -Version 5.1
<#
  Birden fazla Deno API worker — Caddy ile 8787-8788 dagitimi.
  Ornek Caddy upstream:
    reverse_proxy localhost:8787 localhost:8788

  powershell -ExecutionPolicy Bypass -File scripts\start-api-cluster.ps1
  powershell -ExecutionPolicy Bypass -File scripts\start-api-cluster.ps1 -Workers 2 -BasePort 8787
#>
param(
  [int]$Workers = 4,
  [int]$BasePort = 8787
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

$deno = Join-Path $env:USERPROFILE '.deno\bin\deno.exe'
if (-not (Test-Path $deno)) { throw "Deno yok: $deno" }
if (-not (Test-Path (Join-Path $root '.env.local'))) { throw '.env.local gerekli' }

Get-NetTCPConnection -LocalPort ($BasePort..($BasePort + $Workers - 1)) -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

Start-Sleep -Seconds 2

for ($i = 0; $i -lt $Workers; $i++) {
  $port = $BasePort + $i
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $deno
  $psi.Arguments = 'run -A --env-file=.env.local src/supabase/functions/server/index.tsx'
  $psi.WorkingDirectory = $root
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  [void]$psi.EnvironmentVariables['PORT']
  $psi.EnvironmentVariables['PORT'] = "$port"
  $psi.EnvironmentVariables['ILSA_RUN_SCHEMA_ENSURE'] = if ($port -eq $BasePort) { '1' } else { '0' }
  [void][System.Diagnostics.Process]::Start($psi)
  Write-Host "[OK] API worker $($i + 1)/$Workers -> $port"
}

Write-Host "[OK] $Workers worker baslatildi. Caddy upstream'e tum portlari ekleyin."
