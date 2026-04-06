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

$sheet = [System.Drawing.Bitmap]::new(128, 128, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($sheet)
$graphics.Clear([System.Drawing.Color]::Transparent)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
$dynamiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 176, 58, 49))
$dynamiteHighlightBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 222, 111, 78))
$paperBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 233, 214, 173))
$bandBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 122, 73, 44))
$bodyBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 30, 27, 34))
$highlightBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 80, 74, 92))
$metalBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 194, 137, 84))
$sparkBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 255, 205, 102))
$emberBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 255, 129, 68))

function Draw-StickDynamiteFrame {
  param(
    [System.Drawing.Graphics]$Graphics,
    [int]$OffsetX,
    [int]$OffsetY,
    [int]$Frame
  )

  $Graphics.FillRectangle($dynamiteBrush, $OffsetX + 6, $OffsetY + 14, 18, 6)
  $Graphics.FillRectangle($dynamiteHighlightBrush, $OffsetX + 8, $OffsetY + 15, 12, 1)
  $Graphics.FillRectangle($paperBrush, $OffsetX + 5, $OffsetY + 14, 2, 6)
  $Graphics.FillRectangle($paperBrush, $OffsetX + 23, $OffsetY + 14, 2, 6)
  $Graphics.FillRectangle($bandBrush, $OffsetX + 12, $OffsetY + 14, 2, 6)
  $Graphics.FillRectangle($metalBrush, $OffsetX + 21, $OffsetY + 9, 2, 6)
  $Graphics.FillRectangle($metalBrush, $OffsetX + 22, $OffsetY + 7, 2, 3)

  $sparkX = $OffsetX + 23 + [Math]::Min(3, $Frame)
  $sparkY = $OffsetY + 5 + ($Frame % 2)
  $Graphics.FillRectangle($sparkBrush, $sparkX, $sparkY, 2, 2)
  $Graphics.FillRectangle($emberBrush, $sparkX - 2, $sparkY + 2, 2, 2)
}

function Draw-BundleDynamiteFrame {
  param(
    [System.Drawing.Graphics]$Graphics,
    [int]$OffsetX,
    [int]$OffsetY,
    [int]$Frame
  )

  $Graphics.FillRectangle($dynamiteBrush, $OffsetX + 6, $OffsetY + 11, 18, 5)
  $Graphics.FillRectangle($dynamiteBrush, $OffsetX + 6, $OffsetY + 16, 18, 5)
  $Graphics.FillRectangle($dynamiteBrush, $OffsetX + 8, $OffsetY + 6, 14, 5)
  $Graphics.FillRectangle($dynamiteHighlightBrush, $OffsetX + 8, $OffsetY + 12, 12, 1)
  $Graphics.FillRectangle($dynamiteHighlightBrush, $OffsetX + 8, $OffsetY + 17, 12, 1)
  $Graphics.FillRectangle($dynamiteHighlightBrush, $OffsetX + 10, $OffsetY + 7, 9, 1)
  $Graphics.FillRectangle($paperBrush, $OffsetX + 5, $OffsetY + 11, 2, 10)
  $Graphics.FillRectangle($paperBrush, $OffsetX + 23, $OffsetY + 11, 2, 10)
  $Graphics.FillRectangle($bandBrush, $OffsetX + 11, $OffsetY + 9, 3, 14)
  $Graphics.FillRectangle($bandBrush, $OffsetX + 17, $OffsetY + 9, 3, 14)
  $Graphics.FillRectangle($metalBrush, $OffsetX + 20, $OffsetY + 4, 2, 5)
  $Graphics.FillRectangle($metalBrush, $OffsetX + 21, $OffsetY + 2, 2, 3)

  $sparkX = $OffsetX + 22 + [Math]::Min(4, $Frame)
  $sparkY = $OffsetY + 1 + (($Frame + 1) % 2)
  $Graphics.FillRectangle($sparkBrush, $sparkX, $sparkY, 2, 2)
  $Graphics.FillRectangle($emberBrush, $sparkX - 1, $sparkY + 2, 2, 2)
}

function Draw-BombFrame {
  param(
    [System.Drawing.Graphics]$Graphics,
    [int]$OffsetX,
    [int]$OffsetY,
    [int]$Frame
  )

  $Graphics.FillEllipse($bodyBrush, $OffsetX + 7, $OffsetY + 10, 18, 18)
  $Graphics.FillEllipse($highlightBrush, $OffsetX + 10, $OffsetY + 13, 7, 6)
  $Graphics.FillRectangle($metalBrush, $OffsetX + 18, $OffsetY + 5, 3, 8)
  $Graphics.FillRectangle($metalBrush, $OffsetX + 20, $OffsetY + 4, 3, 4)
  $Graphics.FillRectangle($metalBrush, $OffsetX + 22, $OffsetY + 3, 3, 3)
  $Graphics.FillRectangle($metalBrush, $OffsetX + 24, $OffsetY + 2, 2, 3)
  $sparkY = $OffsetY + 1 + ($Frame % 2)
  $sparkX = $OffsetX + 24 + $Frame
  $Graphics.FillRectangle($sparkBrush, $sparkX, $sparkY, 2, 2)
  $Graphics.FillRectangle($emberBrush, $sparkX - 2, $sparkY + 2, 2, 2)
  $Graphics.FillRectangle($emberBrush, $OffsetX + 11, $OffsetY + 25, 10, 2)
}

function Draw-NukeFrame {
  param(
    [System.Drawing.Graphics]$Graphics,
    [int]$OffsetX,
    [int]$OffsetY,
    [int]$Frame
  )

  $shellBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 70, 92, 54))
  $shellHighlightBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 135, 166, 96))
  $hazardBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 238, 205, 71))
  $hazardDarkBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 36, 43, 26))
  $capBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 116, 90, 62))

  $Graphics.FillEllipse($shellBrush, $OffsetX + 6, $OffsetY + 8, 20, 20)
  $Graphics.FillEllipse($shellHighlightBrush, $OffsetX + 10, $OffsetY + 11, 8, 6)
  $Graphics.FillRectangle($capBrush, $OffsetX + 13, $OffsetY + 4, 6, 5)
  $Graphics.FillRectangle($metalBrush, $OffsetX + 15, $OffsetY + 1, 3, 5)
  $Graphics.FillEllipse($hazardBrush, $OffsetX + 11, $OffsetY + 13, 10, 10)
  $Graphics.FillPie($hazardDarkBrush, $OffsetX + 13, $OffsetY + 14, 3, 5, 90, 120)
  $Graphics.FillPie($hazardDarkBrush, $OffsetX + 15, $OffsetY + 14, 3, 5, 210, 120)
  $Graphics.FillPie($hazardDarkBrush, $OffsetX + 14, $OffsetY + 16, 3, 5, 330, 120)

  $sparkY = $OffsetY + 1 + ($Frame % 2)
  $sparkX = $OffsetX + 16 + [Math]::Min(3, $Frame)
  $Graphics.FillRectangle($sparkBrush, $sparkX, $sparkY, 2, 2)
  $Graphics.FillRectangle($emberBrush, $sparkX + 2, $sparkY + 2, 2, 2)

  $shellBrush.Dispose()
  $shellHighlightBrush.Dispose()
  $hazardBrush.Dispose()
  $hazardDarkBrush.Dispose()
  $capBrush.Dispose()
}

for ($frame = 0; $frame -lt 4; $frame += 1) {
  $offsetX = $frame * 32
  Draw-StickDynamiteFrame -Graphics $graphics -OffsetX $offsetX -OffsetY 0 -Frame $frame
  Draw-BundleDynamiteFrame -Graphics $graphics -OffsetX $offsetX -OffsetY 32 -Frame $frame
  Draw-BombFrame -Graphics $graphics -OffsetX $offsetX -OffsetY 64 -Frame $frame
  Draw-NukeFrame -Graphics $graphics -OffsetX $offsetX -OffsetY 96 -Frame $frame
}
$sheet.Save((Join-Path $spriteDir 'bomb-spritesheet.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$sheet.Dispose()
