# 生成应用图标 build/icon.png (512x512)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$size = 512
$bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(255, 99, 102, 241), [System.Drawing.Color]::FromArgb(255, 34, 211, 238), 45)

$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$d = 120
$path.AddArc(0, 0, $d, $d, 180, 90)
$path.AddArc($size - $d, 0, $d, $d, 270, 90)
$path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
$path.AddArc(0, $size - $d, $d, $d, 90, 90)
$path.CloseFigure()
$g.FillPath($brush, $path)

$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 255, 255, 255), 10)
$g.DrawPath($pen, $path)

$font = New-Object System.Drawing.Font('Segoe UI', 168, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString('DSH', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF(0, -12, $size, $size)), $sf)

$dir = Join-Path $PSScriptRoot '..\build'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$bmp.Save((Join-Path $dir 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose(); $bmp.Dispose(); $path.Dispose(); $brush.Dispose(); $pen.Dispose()
Write-Host 'icon.png generated'
