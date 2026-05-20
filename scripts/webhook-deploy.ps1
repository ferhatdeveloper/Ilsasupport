# GitHub push webhook dinleyicisi — secret ile doğrular, deploy-from-git çalıştırır.
# Ortam: $env:ILSA_DEPLOY_WEBHOOK_SECRET, $env:ILSA_DEPLOY_PORT (varsayılan 9876)
param(
  [int]$Port = $(if ($env:ILSA_DEPLOY_PORT) { [int]$env:ILSA_DEPLOY_PORT } else { 9876 }),
  [string]$Secret = $env:ILSA_DEPLOY_WEBHOOK_SECRET,
  [string]$RepoRoot = 'C:\ilsasupport'
)

if (-not $Secret) {
  Write-Error 'ILSA_DEPLOY_WEBHOOK_SECRET tanımlayın (GitHub webhook Secret ile aynı).'
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://+:$Port/deploy/"
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Webhook dinleniyor: $prefix" -ForegroundColor Green

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    if ($req.HttpMethod -ne 'POST') {
      $res.StatusCode = 405
      $res.Close()
      continue
    }
    $sig = $req.Headers['X-Hub-Signature-256']
    $reader = New-Object System.IO.StreamReader($req.InputStream, $req.ContentEncoding)
    $body = $reader.ReadToEnd()
    $reader.Close()

    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = [Text.Encoding]::UTF8.GetBytes($Secret)
    $hash = 'sha256=' + ([BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($body)))).Replace('-', '').ToLower()
    if ($sig -ne $hash) {
      $res.StatusCode = 401
      $bytes = [Text.Encoding]::UTF8.GetBytes('invalid signature')
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.Close()
      continue
    }

    $payload = $body | ConvertFrom-Json
    if ($payload.ref -and $payload.ref -notmatch 'refs/heads/(main|master)$') {
      $res.StatusCode = 200
      $msg = [Text.Encoding]::UTF8.GetBytes('ignored branch')
      $res.OutputStream.Write($msg, 0, $msg.Length)
      $res.Close()
      continue
    }

    Write-Host "[$(Get-Date -Format o)] Deploy tetiklendi: $($payload.repository.full_name)" -ForegroundColor Cyan
    $deployScript = Join-Path $RepoRoot 'scripts\deploy-from-git.ps1'
    Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $deployScript) -WorkingDirectory $RepoRoot -WindowStyle Hidden

    $res.StatusCode = 202
    $ok = [Text.Encoding]::UTF8.GetBytes('deploy started')
    $res.OutputStream.Write($ok, 0, $ok.Length)
  } catch {
    $res.StatusCode = 500
    $err = [Text.Encoding]::UTF8.GetBytes($_.Exception.Message)
    $res.OutputStream.Write($err, 0, $err.Length)
  } finally {
    $res.Close()
  }
}
