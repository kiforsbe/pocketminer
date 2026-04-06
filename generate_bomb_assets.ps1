$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Save-Wav {
  param(
    [string]$Path,
    [double[]]$Samples,
    [int]$SampleRate = 44100
  )

  $channels = 1
  $bitsPerSample = 16
  $blockAlign = $channels * ($bitsPerSample / 8)
  $byteRate = $SampleRate * $blockAlign
  $dataBytes = New-Object byte[] ($Samples.Length * 2)

  for ($i = 0; $i -lt $Samples.Length; $i += 1) {
    $clamped = [Math]::Max(-1.0, [Math]::Min(1.0, $Samples[$i]))
    $value = [int16][Math]::Round($clamped * 32767)
    [BitConverter]::GetBytes($value).CopyTo($dataBytes, $i * 2)
  }

  $stream = [System.IO.MemoryStream]::new()
  $writer = [System.IO.BinaryWriter]::new($stream)
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes('RIFF'))
  $writer.Write([int](36 + $dataBytes.Length))
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes('WAVE'))
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes('fmt '))
  $writer.Write([int]16)
  $writer.Write([int16]1)
  $writer.Write([int16]$channels)
  $writer.Write([int]$SampleRate)
  $writer.Write([int]$byteRate)
  $writer.Write([int16]$blockAlign)
  $writer.Write([int16]$bitsPerSample)
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes('data'))
  $writer.Write([int]$dataBytes.Length)
  $writer.Write($dataBytes)
  [System.IO.File]::WriteAllBytes($Path, $stream.ToArray())
  $writer.Dispose()
  $stream.Dispose()
}

$root = Split-Path -Parent $PSCommandPath
$spriteDir = Join-Path $root 'assets/sprites'
$sfxDir = Join-Path $root 'assets/sfx'

$sampleRate = 44100
$fuseDuration = 2.0
$fuseCount = [int]($sampleRate * $fuseDuration)
$fuseSamples = New-Object double[] $fuseCount
$previousNoise = 0.0
for ($i = 0; $i -lt $fuseCount; $i += 1) {
  $t = $i / $sampleRate
  $whiteNoise = (Get-Random -Minimum -1000 -Maximum 1000) / 1000.0
  $filteredNoise = $previousNoise * 0.72 + $whiteNoise * 0.28
  $previousNoise = $filteredNoise
  $rumble = [Math]::Sin(2 * [Math]::PI * 72 * $t) * 0.16
  $crackle = [Math]::Sin(2 * [Math]::PI * 180 * $t) * 0.07
  $envelope = 0.16 + 0.08 * ($t / $fuseDuration)
  $fuseSamples[$i] = ($filteredNoise * 0.82 + $rumble + $crackle) * $envelope
}
Save-Wav -Path (Join-Path $sfxDir 'bomb-fuse.wav') -Samples $fuseSamples -SampleRate $sampleRate

$boomDuration = 0.7
$boomCount = [int]($sampleRate * $boomDuration)
$boomSamples = New-Object double[] $boomCount
for ($i = 0; $i -lt $boomCount; $i += 1) {
  $t = $i / $sampleRate
  $noise = (Get-Random -Minimum -1000 -Maximum 1000) / 1000.0
  $bass = [Math]::Sin(2 * [Math]::PI * 58 * $t) + 0.5 * [Math]::Sin(2 * [Math]::PI * 91 * $t)
  $envelope = [Math]::Exp(-5.4 * $t)
  $boomSamples[$i] = ($noise * 0.65 + $bass * 0.5) * $envelope * 0.92
}
Save-Wav -Path (Join-Path $sfxDir 'bomb-explode.wav') -Samples $boomSamples -SampleRate $sampleRate

$sheet = [System.Drawing.Bitmap]::new(128, 32, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($sheet)
$graphics.Clear([System.Drawing.Color]::Transparent)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
$bodyBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 30, 27, 34))
$highlightBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 80, 74, 92))
$metalBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 194, 137, 84))
$sparkBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 255, 205, 102))
$emberBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 255, 129, 68))
for ($frame = 0; $frame -lt 4; $frame += 1) {
  $offsetX = $frame * 32
  $graphics.FillEllipse($bodyBrush, $offsetX + 7, 10, 18, 18)
  $graphics.FillEllipse($highlightBrush, $offsetX + 10, 13, 7, 6)
  $graphics.FillRectangle($metalBrush, $offsetX + 18, 5, 3, 8)
  $graphics.FillRectangle($metalBrush, $offsetX + 20, 4, 3, 4)
  $graphics.FillRectangle($metalBrush, $offsetX + 22, 3, 3, 3)
  $graphics.FillRectangle($metalBrush, $offsetX + 24, 2, 2, 3)
  $sparkY = 1 + ($frame % 2)
  $sparkX = $offsetX + 24 + $frame
  $graphics.FillRectangle($sparkBrush, $sparkX, $sparkY, 2, 2)
  $graphics.FillRectangle($emberBrush, $sparkX - 2, $sparkY + 2, 2, 2)
  $graphics.FillRectangle($emberBrush, $offsetX + 11, 25, 10, 2)
}
$sheet.Save((Join-Path $spriteDir 'bomb-spritesheet.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$sheet.Dispose()

$icon = [System.Drawing.Bitmap]::new(32, 32, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$iconGraphics = [System.Drawing.Graphics]::FromImage($icon)
$iconGraphics.Clear([System.Drawing.Color]::Transparent)
$iconGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$shadow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(120, 0, 0, 0))
$body = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 31, 28, 34))
$highlight = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 88, 80, 97))
$fuse = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 194, 137, 84))
$spark = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 255, 205, 102))
$iconGraphics.FillEllipse($shadow, 7, 19, 18, 6)
$iconGraphics.FillEllipse($body, 6, 8, 20, 20)
$iconGraphics.FillEllipse($highlight, 10, 12, 8, 7)
$iconGraphics.FillRectangle($fuse, 18, 3, 3, 8)
$iconGraphics.FillRectangle($fuse, 20, 2, 3, 4)
$iconGraphics.FillRectangle($fuse, 22, 1, 2, 3)
$iconGraphics.FillEllipse($spark, 23, 0, 5, 5)
$icon.Save((Join-Path $spriteDir 'bomb-icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$iconGraphics.Dispose()
$icon.Dispose()
