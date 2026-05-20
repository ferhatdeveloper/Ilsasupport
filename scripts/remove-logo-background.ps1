param(
  [string]$InputPath = "C:\Users\Administrator\.cursor\projects\c-ilsasupport\assets\c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_ilsa2026-861565ae-8a55-400a-8a4b-8682017de108.png",
  [string]$OutputPath = "c:\ilsasupport\public\logo2026.png"
)

Add-Type -AssemblyName System.Drawing

function Clamp([double]$v) {
  $n = [int][Math]::Round($v)
  if ($n -lt 0) { return 0 }
  if ($n -gt 255) { return 255 }
  return $n
}

$loaded = [System.Drawing.Bitmap]::FromFile($InputPath)
$w = $loaded.Width
$h = $loaded.Height
$src = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$src.SetResolution($loaded.HorizontalResolution, $loaded.VerticalResolution)
$g = [System.Drawing.Graphics]::FromImage($src)
$g.Clear([System.Drawing.Color]::Transparent)
$g.DrawImage($loaded, 0, 0, $w, $h)
$g.Dispose()
$loaded.Dispose()

$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$data = $src.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, $src.PixelFormat)
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)

for ($y = 0; $y -lt $h; $y++) {
  $row = $y * $stride
  for ($x = 0; $x -lt $w; $x++) {
    $i = $row + ($x * 4)
    $b = $bytes[$i]
    $g = $bytes[$i + 1]
    $r = $bytes[$i + 2]
    $max = [Math]::Max($r, [Math]::Max($g, $b))
    $min = [Math]::Min($r, [Math]::Min($g, $b))
    $lum = 0.2126 * $r + 0.7152 * $g + 0.0722 * $b
    $sat = if ($max -eq 0) { 0 } else { ($max - $min) / $max }
    $a = 255

    if ($lum -ge 246 -and $sat -le 0.09) {
      $a = 0
    }
    elseif ($lum -ge 232 -and $sat -le 0.11) {
      $a = Clamp ((246 - $lum) * 16)
    }
    elseif ($lum -ge 218 -and $sat -le 0.09) {
      $a = Clamp ((232 - $lum) * 6)
    }

    $bytes[$i + 3] = [byte]$a
  }
}

[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
$src.UnlockBits($data)

$dir = Split-Path $OutputPath -Parent
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$src.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$src.Dispose()
Write-Host "OK: $OutputPath ($w x $h)"
