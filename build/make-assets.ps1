# Gera os ícones e a splash do executável a partir das artes em build/assets/src/.
# Uso: powershell -ExecutionPolicy Bypass -File build/make-assets.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $root 'assets\src'
$out = Join-Path $root 'assets'
$pub = Join-Path (Split-Path -Parent $root) 'public'

function RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90); $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90); $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure(); return $p
}

# --- ícone: recorta o "squircle" da arte e aplica cantos arredondados transparentes
$art = [System.Drawing.Image]::FromFile((Join-Path $src 'icon.jpg'))
$k = $art.Width / 1024.0
$crop = New-Object System.Drawing.RectangleF ([float](134 * $k)), ([float](130 * $k)), ([float](756 * $k)), ([float](764 * $k))
function IconPng([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)
  $pad = [Math]::Max(0, [Math]::Round($size * 0.02))
  $path = RoundRect $pad $pad ($size - 2 * $pad) ($size - 2 * $pad) (($size - 2 * $pad) * 0.2)
  $g.SetClip($path)
  $dst = New-Object System.Drawing.RectangleF $pad, $pad, ($size - 2 * $pad), ($size - 2 * $pad)
  $g.DrawImage($art, $dst, $crop, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  return , $ms.ToArray()
}
$sizes = 256, 128, 64, 48, 32, 24, 16
$pngs = @{}
foreach ($s in $sizes) { $pngs[$s] = IconPng $s }
# .ico com imagens PNG (Windows Vista+)
$ico = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $ico
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
foreach ($s in $sizes) {
  $b = if ($s -ge 256) { 0 } else { $s }
  $bw.Write([byte]$b); $bw.Write([byte]$b); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]$pngs[$s].Length); $bw.Write([UInt32]$offset)
  $offset += $pngs[$s].Length
}
foreach ($s in $sizes) { $bw.Write($pngs[$s]) }
$bw.Flush()
[IO.File]::WriteAllBytes((Join-Path $out 'castdeck.ico'), $ico.ToArray())
[IO.File]::WriteAllBytes((Join-Path $out 'icon-256.png'), $pngs[256])
# favicon das páginas (a janela do app usa no título e na barra de tarefas)
[IO.File]::WriteAllBytes((Join-Path $pub 'icon.png'), $pngs[256])
[IO.File]::WriteAllBytes((Join-Path $pub 'favicon.ico'), $ico.ToArray())
$art.Dispose()

# --- splash 640x360
$sp = [System.Drawing.Image]::FromFile((Join-Path $src 'splash.jpg'))
$bmp = New-Object System.Drawing.Bitmap 640, 360
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'AntiAlias'
$g.DrawImage($sp, 0, 0, 640, 360)
$g.Dispose(); $sp.Dispose()
$bmp.Save((Join-Path $out 'splash.png'), [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
Write-Host 'assets ok'
