$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-HexColor {
  param([string]$Hex)

  $normalized = $Hex.TrimStart('#')
  if ($normalized.Length -ne 6) {
    throw "Unsupported color format: $Hex"
  }

  return [System.Drawing.Color]::FromArgb(
    255,
    [Convert]::ToInt32($normalized.Substring(0, 2), 16),
    [Convert]::ToInt32($normalized.Substring(2, 2), 16),
    [Convert]::ToInt32($normalized.Substring(4, 2), 16)
  )
}

function New-RgbaColor {
  param(
    [int]$R,
    [int]$G,
    [int]$B,
    [int]$A = 255
  )

  return [System.Drawing.Color]::FromArgb($A, $R, $G, $B)
}

function Fill-Rect {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Color]$Color,
    [double]$X,
    [double]$Y,
    [double]$Width,
    [double]$Height
  )

  $brush = [System.Drawing.SolidBrush]::new($Color)
  try {
    $Graphics.FillRectangle($brush, [float]$X, [float]$Y, [float]$Width, [float]$Height)
  }
  finally {
    $brush.Dispose()
  }
}

function Draw-Rect {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Color]$Color,
    [double]$X,
    [double]$Y,
    [double]$Width,
    [double]$Height,
    [double]$LineWidth = 1
  )

  $pen = [System.Drawing.Pen]::new($Color, [float]$LineWidth)
  try {
    $Graphics.DrawRectangle($pen, [float]$X, [float]$Y, [float]$Width, [float]$Height)
  }
  finally {
    $pen.Dispose()
  }
}

function Fill-Polygon {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Color]$Color,
    [array]$Points
  )

  $brush = [System.Drawing.SolidBrush]::new($Color)
  try {
    $Graphics.FillPolygon($brush, $Points)
  }
  finally {
    $brush.Dispose()
  }
}

function Draw-LinePath {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Color]$Color,
    [double]$LineWidth,
    [array]$Segments
  )

  $pen = [System.Drawing.Pen]::new($Color, [float]$LineWidth)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  try {
    foreach ($segment in $Segments) {
      if ($segment.Count -lt 2) {
        continue
      }

      $points = [System.Drawing.PointF[]]@($segment)
      $Graphics.DrawLines($pen, $points)
    }
  }
  finally {
    $pen.Dispose()
  }
}

function Supports-SurfaceTreatment {
  param([string]$Type)

  return $Type -notin @('empty', 'chest', 'platform', 'magma')
}

function Build-TileKey {
  param(
    [string]$Type,
    [AllowNull()][string]$SurfaceTreatment,
    [int]$SurfaceVariant,
    [int]$Frame
  )

  $treatment = if ([string]::IsNullOrEmpty($SurfaceTreatment)) { 'none' } else { $SurfaceTreatment }
  $variant = if ($SurfaceTreatment -eq 'grass') { $SurfaceVariant % 3 } else { 0 }
  return "tile:${Type}:${treatment}:${variant}:${Frame}"
}

function Build-DebrisKey {
  param(
    [string]$Type,
    [int]$Variant,
    [string]$Placement
  )

  return "debris:${Placement}:${Type}:$($Variant % 3)"
}

function Build-CrackKey {
  param([int]$CrackLevel)

  $normalized = [Math]::Max(1, [Math]::Min(4, $CrackLevel))
  return "crack:${normalized}"
}

function Draw-LegacyTilePattern {
  param(
    [System.Drawing.Graphics]$Graphics,
    $Definition,
    [double]$X,
    [double]$Y,
    [double]$Unit
  )

  switch ($Definition.type) {
    'dirt' {
      $accent = New-HexColor $Definition.accent
      foreach ($chunk in @(
        @{ x = 4; y = 4; w = 4; h = 4 },
        @{ x = 10; y = 4; w = 4; h = 4 },
        @{ x = 18; y = 4; w = 4; h = 4 },
        @{ x = 24; y = 8; w = 4; h = 4 },
        @{ x = 7; y = 14; w = 4; h = 4 },
        @{ x = 14; y = 18; w = 4; h = 4 },
        @{ x = 22; y = 21; w = 4; h = 4 }
      )) {
        Fill-Rect $Graphics $accent ($X + $chunk.x * $Unit) ($Y + $chunk.y * $Unit) ($chunk.w * $Unit) ($chunk.h * $Unit)
      }
      return $true
    }
    'stone' {
      Fill-Rect $Graphics (New-HexColor '#5c6678') ($X + 4 * $Unit) ($Y + 4 * $Unit) (24 * $Unit) (24 * $Unit)
      $accent = New-HexColor $Definition.accent
      Fill-Rect $Graphics $accent ($X + 6 * $Unit) ($Y + 6 * $Unit) (20 * $Unit) (2 * $Unit)
      Fill-Rect $Graphics $accent ($X + 6 * $Unit) ($Y + 14 * $Unit) (20 * $Unit) (2 * $Unit)
      Fill-Rect $Graphics $accent ($X + 6 * $Unit) ($Y + 22 * $Unit) (20 * $Unit) (2 * $Unit)
      Fill-Rect $Graphics $accent ($X + 6 * $Unit) ($Y + 6 * $Unit) (2 * $Unit) (18 * $Unit)
      Fill-Rect $Graphics $accent ($X + 14 * $Unit) ($Y + 8 * $Unit) (2 * $Unit) (18 * $Unit)
      Fill-Rect $Graphics $accent ($X + 22 * $Unit) ($Y + 6 * $Unit) (2 * $Unit) (18 * $Unit)
      return $true
    }
    'coal' {
      $cavity = New-HexColor '#221d26'
      Fill-Rect $Graphics $cavity ($X + 5 * $Unit) ($Y + 5 * $Unit) (8 * $Unit) (8 * $Unit)
      Fill-Rect $Graphics $cavity ($X + 18 * $Unit) ($Y + 5 * $Unit) (7 * $Unit) (7 * $Unit)
      Fill-Rect $Graphics $cavity ($X + 8 * $Unit) ($Y + 18 * $Unit) (7 * $Unit) (7 * $Unit)
      Fill-Rect $Graphics $cavity ($X + 20 * $Unit) ($Y + 19 * $Unit) (5 * $Unit) (5 * $Unit)
      $shine = New-RgbaColor 255 255 255 20
      Fill-Rect $Graphics $shine ($X + 5 * $Unit) ($Y + 5 * $Unit) (8 * $Unit) (1 * $Unit)
      Fill-Rect $Graphics $shine ($X + 18 * $Unit) ($Y + 5 * $Unit) (7 * $Unit) (1 * $Unit)
      Fill-Rect $Graphics $shine ($X + 8 * $Unit) ($Y + 18 * $Unit) (7 * $Unit) (1 * $Unit)
      return $true
    }
    'iron' {
      $accent = New-HexColor $Definition.accent
      foreach ($vein in @(
        @{ x = 6; y = 6; w = 4; h = 8 },
        @{ x = 4; y = 8; w = 8; h = 4 },
        @{ x = 19; y = 9; w = 4; h = 7 },
        @{ x = 17; y = 11; w = 8; h = 3 },
        @{ x = 12; y = 19; w = 5; h = 7 },
        @{ x = 10; y = 21; w = 9; h = 3 }
      )) {
        Fill-Rect $Graphics $accent ($X + $vein.x * $Unit) ($Y + $vein.y * $Unit) ($vein.w * $Unit) ($vein.h * $Unit)
      }
      $shine = New-RgbaColor 255 214 184 71
      Fill-Rect $Graphics $shine ($X + 7 * $Unit) ($Y + 6 * $Unit) (1 * $Unit) (8 * $Unit)
      Fill-Rect $Graphics $shine ($X + 20 * $Unit) ($Y + 9 * $Unit) (1 * $Unit) (7 * $Unit)
      Fill-Rect $Graphics $shine ($X + 13 * $Unit) ($Y + 19 * $Unit) (1 * $Unit) (7 * $Unit)
      return $true
    }
    default {
      return $false
    }
  }
}

function Draw-MagmaPattern {
  param(
    [System.Drawing.Graphics]$Graphics,
    $Definition,
    [double]$X,
    [double]$Y,
    [double]$Size,
    [double]$Time,
    [int]$Column,
    [int]$Row
  )

  $unit = $Size / 32.0
  $phase = $Time * 3.4 + $Column * 0.73 + $Row * 0.51
  $pulseA = ([Math]::Sin($phase) + 1) * 0.5
  $pulseB = ([Math]::Sin($phase * 1.37 + 1.2) + 1) * 0.5
  $pulseC = ([Math]::Cos($phase * 1.91 - 0.8) + 1) * 0.5

  Fill-Rect $Graphics (New-HexColor $Definition.fill) $X $Y $Size $Size

  $darkPool = New-RgbaColor 33 12 16 235
  Fill-Rect $Graphics $darkPool ($X + 2 * $unit) ($Y + 2 * $unit) (10 * $unit) (9 * $unit)
  Fill-Rect $Graphics $darkPool ($X + 18 * $unit) ($Y + 3 * $unit) (11 * $unit) (8 * $unit)
  Fill-Rect $Graphics $darkPool ($X + 4 * $unit) ($Y + 19 * $unit) (9 * $unit) (9 * $unit)
  Fill-Rect $Graphics $darkPool ($X + 16 * $unit) ($Y + 18 * $unit) (12 * $unit) (10 * $unit)

  $lavaA = New-RgbaColor (160 + [Math]::Round($pulseA * 60)) (46 + [Math]::Round($pulseB * 44)) (20 + [Math]::Round($pulseC * 18))
  Fill-Rect $Graphics $lavaA ($X + 4 * $unit) ($Y + (6 + [Math]::Round($pulseA * 2)) * $unit) (24 * $unit) (4 * $unit)
  Fill-Rect $Graphics $lavaA ($X + 6 * $unit) ($Y + (14 + [Math]::Round($pulseB * 2)) * $unit) (19 * $unit) (4 * $unit)
  Fill-Rect $Graphics $lavaA ($X + 8 * $unit) ($Y + (22 - [Math]::Round($pulseC * 2)) * $unit) (16 * $unit) (3 * $unit)

  $lavaB = New-RgbaColor (220 + [Math]::Round($pulseB * 28)) (112 + [Math]::Round($pulseA * 50)) (28 + [Math]::Round($pulseC * 20))
  Fill-Rect $Graphics $lavaB ($X + 9 * $unit) ($Y + (8 + [Math]::Round($pulseC * 1.5)) * $unit) (5 * $unit) (5 * $unit)
  Fill-Rect $Graphics $lavaB ($X + 20 * $unit) ($Y + (12 - [Math]::Round($pulseA * 2)) * $unit) (4 * $unit) (4 * $unit)
  Fill-Rect $Graphics $lavaB ($X + 13 * $unit) ($Y + (19 + [Math]::Round($pulseB * 1.5)) * $unit) (6 * $unit) (5 * $unit)

  $glow = New-RgbaColor 255 (180 + [Math]::Round($pulseA * 40)) (88 + [Math]::Round($pulseB * 32)) 179
  Fill-Rect $Graphics $glow ($X + 7 * $unit) ($Y + 7 * $unit) (16 * $unit) (1 * $unit)
  Fill-Rect $Graphics $glow ($X + 11 * $unit) ($Y + 15 * $unit) (10 * $unit) (1 * $unit)
  Fill-Rect $Graphics $glow ($X + 10 * $unit) ($Y + 23 * $unit) (8 * $unit) (1 * $unit)
}

function Draw-TilePattern {
  param(
    [System.Drawing.Graphics]$Graphics,
    $Definition,
    [double]$X,
    [double]$Y,
    [double]$Size,
    [double]$Time,
    [int]$Column,
    [int]$Row
  )

  $unit = $Size / 32.0
  $hasSolidBackdrop = $Definition.pattern -notin @('chest', 'platform')
  if ($hasSolidBackdrop) {
    Fill-Rect $Graphics (New-HexColor $Definition.fill) $X $Y $Size $Size
    Draw-Rect $Graphics (New-RgbaColor 0 0 0 46) $X $Y ($Size - 1) ($Size - 1) 1
  }
  if (Draw-LegacyTilePattern $Graphics $Definition $X $Y $unit) {
    return
  }
  $accent = New-HexColor $Definition.accent

  switch ($Definition.pattern) {
    'speck' {
      foreach ($offset in @(4, 11, 18, 24)) {
        Fill-Rect $Graphics $accent ($X + $offset * $unit) ($Y + (6 + ($offset % 4) * 4) * $unit) (4 * $unit) (4 * $unit)
      }
    }
    'bands' {
      Fill-Rect $Graphics $accent ($X + 4 * $unit) ($Y + 6 * $unit) (22 * $unit) (2 * $unit)
      Fill-Rect $Graphics $accent ($X + 7 * $unit) ($Y + 14 * $unit) (18 * $unit) (2 * $unit)
      Fill-Rect $Graphics $accent ($X + 5 * $unit) ($Y + 22 * $unit) (20 * $unit) (2 * $unit)
    }
    'slate' {
      Fill-Rect $Graphics $accent ($X + 5 * $unit) ($Y + 5 * $unit) (20 * $unit) (3 * $unit)
      Fill-Rect $Graphics $accent ($X + 9 * $unit) ($Y + 12 * $unit) (16 * $unit) (2 * $unit)
      Fill-Rect $Graphics $accent ($X + 4 * $unit) ($Y + 19 * $unit) (22 * $unit) (3 * $unit)
    }
    'blocks' {
      Fill-Rect $Graphics $accent ($X + 5 * $unit) ($Y + 5 * $unit) (8 * $unit) (8 * $unit)
      Fill-Rect $Graphics $accent ($X + 17 * $unit) ($Y + 8 * $unit) (9 * $unit) (9 * $unit)
      Fill-Rect $Graphics $accent ($X + 9 * $unit) ($Y + 19 * $unit) (12 * $unit) (6 * $unit)
    }
    'magma' {
      Draw-MagmaPattern $Graphics $Definition $X $Y $Size $Time $Column $Row
    }
    'chest' {
      $base = New-HexColor $Definition.fill
      Fill-Rect $Graphics $base ($X + 5 * $unit) ($Y + 10 * $unit) (22 * $unit) (14 * $unit)
      Fill-Rect $Graphics $base ($X + 7 * $unit) ($Y + 7 * $unit) (18 * $unit) (5 * $unit)
      Fill-Rect $Graphics (New-HexColor '#34210c') ($X + 5 * $unit) ($Y + 12 * $unit) (22 * $unit) (2 * $unit)
      Fill-Rect $Graphics (New-HexColor $Definition.accent) ($X + 14 * $unit) ($Y + 13 * $unit) (4 * $unit) (8 * $unit)
      Fill-Rect $Graphics (New-HexColor $Definition.accent) ($X + 5 * $unit) ($Y + 16 * $unit) (22 * $unit) (2 * $unit)
    }
    'platform' {
      $base = New-HexColor $Definition.fill
      Fill-Rect $Graphics $base ($X + 4 * $unit) ($Y + 1 * $unit) (24 * $unit) (5 * $unit)
      Fill-Rect $Graphics $base ($X + 6 * $unit) ($Y + 6 * $unit) (20 * $unit) (2 * $unit)
      $support = New-HexColor '#4f3720'
      Fill-Rect $Graphics $support ($X + 8 * $unit) ($Y + 8 * $unit) (3 * $unit) (6 * $unit)
      Fill-Rect $Graphics $support ($X + 15 * $unit) ($Y + 8 * $unit) (3 * $unit) (6 * $unit)
      Fill-Rect $Graphics $support ($X + 22 * $unit) ($Y + 8 * $unit) (3 * $unit) (6 * $unit)
      Fill-Rect $Graphics (New-HexColor $Definition.accent) ($X + 6 * $unit) ($Y + 2 * $unit) (20 * $unit) (1 * $unit)
    }
    'ore-cluster' {
      Fill-Rect $Graphics $accent ($X + 6 * $unit) ($Y + 5 * $unit) (6 * $unit) (6 * $unit)
      Fill-Rect $Graphics $accent ($X + 18 * $unit) ($Y + 8 * $unit) (7 * $unit) (7 * $unit)
      Fill-Rect $Graphics $accent ($X + 11 * $unit) ($Y + 19 * $unit) (8 * $unit) (8 * $unit)
    }
    'ore-gem' {
      Fill-Rect $Graphics $accent ($X + 7 * $unit) ($Y + 6 * $unit) (5 * $unit) (5 * $unit)
      Fill-Rect $Graphics $accent ($X + 19 * $unit) ($Y + 10 * $unit) (6 * $unit) (6 * $unit)
      Fill-Rect $Graphics $accent ($X + 13 * $unit) ($Y + 18 * $unit) (7 * $unit) (7 * $unit)
      Fill-Rect $Graphics $accent ($X + 9 * $unit) ($Y + 14 * $unit) (3 * $unit) (3 * $unit)
    }
    'gem-shard' {
      Fill-Rect $Graphics $accent ($X + 8 * $unit) ($Y + 6 * $unit) (4 * $unit) (8 * $unit)
      Fill-Rect $Graphics $accent ($X + 20 * $unit) ($Y + 9 * $unit) (5 * $unit) (9 * $unit)
      Fill-Rect $Graphics $accent ($X + 13 * $unit) ($Y + 19 * $unit) (6 * $unit) (7 * $unit)
    }
  }
}

function Draw-GrassCap {
  param(
    [System.Drawing.Graphics]$Graphics,
    [double]$X,
    [double]$Y,
    [int]$TileSize,
    [int]$Variant
  )

  Fill-Rect $Graphics (New-HexColor '#4a922f') $X $Y $TileSize 5
  Fill-Rect $Graphics (New-HexColor '#7dcb4f') $X $Y $TileSize 2
  Fill-Rect $Graphics (New-HexColor '#7dcb4f') ($X + 3) ($Y + 4) 3 3
  Fill-Rect $Graphics (New-HexColor '#7dcb4f') ($X + 9) ($Y + 5) 4 3
  Fill-Rect $Graphics (New-HexColor '#7dcb4f') ($X + 17) ($Y + 4) 3 4
  Fill-Rect $Graphics (New-HexColor '#7dcb4f') ($X + 24) ($Y + 5) 4 3

  $palettes = @(
    @{ petal = '#f1d04d'; center = '#fff4a3'; flowers = @(@{ x = 7; y = 1; stem = 4 }, @{ x = 20; y = 2; stem = 4 }) },
    @{ petal = '#b277e8'; center = '#f4d7ff'; flowers = @(@{ x = 6; y = 2; stem = 3 }, @{ x = 14; y = 1; stem = 4 }, @{ x = 23; y = 2; stem = 3 }) },
    @{ petal = '#58a8ea'; center = '#d8f2ff'; flowers = @(@{ x = 8; y = 1; stem = 4 }, @{ x = 18; y = 2; stem = 3 }, @{ x = 25; y = 1; stem = 4 }) }
  )

  $palette = $palettes[$Variant % $palettes.Count]
  $petal = New-HexColor $palette.petal
  $center = New-HexColor $palette.center
  foreach ($flower in $palette.flowers) {
    Fill-Rect $Graphics $petal ($X + $flower.x) ($Y + $flower.y) 2 2
    Fill-Rect $Graphics $petal ($X + $flower.x + 1) ($Y + $flower.y - 1) 1 $flower.stem
    Fill-Rect $Graphics $center ($X + $flower.x + 1) ($Y + $flower.y) 1 1
  }
}

function Draw-MossCap {
  param(
    [System.Drawing.Graphics]$Graphics,
    [double]$X,
    [double]$Y,
    [int]$TileSize
  )

  Fill-Rect $Graphics (New-HexColor '#2f4a24') $X $Y $TileSize 4
  Fill-Rect $Graphics (New-HexColor '#456736') ($X + 2) ($Y + 1) ($TileSize - 4) 2
  Fill-Rect $Graphics (New-HexColor '#456736') ($X + 4) ($Y + 4) 5 2
  Fill-Rect $Graphics (New-HexColor '#456736') ($X + 13) ($Y + 3) 6 3
  Fill-Rect $Graphics (New-HexColor '#456736') ($X + 23) ($Y + 4) 4 2
  Fill-Rect $Graphics (New-HexColor '#d8d1c6') ($X + 8) ($Y + 2) 2 3
  Fill-Rect $Graphics (New-HexColor '#d8d1c6') ($X + 22) ($Y + 1) 2 4
  Fill-Rect $Graphics (New-HexColor '#7a685f') ($X + 7) ($Y + 1) 4 2
  Fill-Rect $Graphics (New-HexColor '#7a685f') ($X + 21) $Y 4 2
  Fill-Rect $Graphics (New-HexColor '#efe6db') ($X + 8) ($Y + 1) 1 1
  Fill-Rect $Graphics (New-HexColor '#efe6db') ($X + 22) $Y 1 1
}

function Draw-RockCap {
  param(
    [System.Drawing.Graphics]$Graphics,
    [double]$X,
    [double]$Y,
    [int]$TileSize,
    [bool]$DrawStalagmites
  )

  Fill-Rect $Graphics (New-HexColor '#232934') $X $Y $TileSize 4
  $highlight = New-RgbaColor 188 198 214 64
  Fill-Rect $Graphics $highlight ($X + 3) ($Y + 1) 7 1
  Fill-Rect $Graphics $highlight ($X + 14) ($Y + 2) 5 1
  Fill-Rect $Graphics $highlight ($X + 23) ($Y + 1) 4 1

  if ($DrawStalagmites) {
    $spire = New-HexColor '#5b6577'
    Fill-Polygon $Graphics $spire @(
      [System.Drawing.PointF]::new([float]($X + 4), [float]($Y + 4)),
      [System.Drawing.PointF]::new([float]($X + 7), [float]($Y - 1)),
      [System.Drawing.PointF]::new([float]($X + 10), [float]($Y + 4))
    )
    Fill-Polygon $Graphics $spire @(
      [System.Drawing.PointF]::new([float]($X + 14), [float]($Y + 4)),
      [System.Drawing.PointF]::new([float]($X + 17), [float]($Y - 3)),
      [System.Drawing.PointF]::new([float]($X + 20), [float]($Y + 4))
    )
    Fill-Polygon $Graphics $spire @(
      [System.Drawing.PointF]::new([float]($X + 23), [float]($Y + 4)),
      [System.Drawing.PointF]::new([float]($X + 26), [float]$Y),
      [System.Drawing.PointF]::new([float]($X + 29), [float]($Y + 4))
    )
  }

  $crackSegments = @(
    @(
      [System.Drawing.PointF]::new([float]($X + 6), [float]($Y + 4)),
      [System.Drawing.PointF]::new([float]($X + 10), [float]($Y + 7))
    ),
    @(
      [System.Drawing.PointF]::new([float]($X + 15), [float]($Y + 4)),
      [System.Drawing.PointF]::new([float]($X + 13), [float]($Y + 8)),
      [System.Drawing.PointF]::new([float]($X + 18), [float]($Y + 10))
    ),
    @(
      [System.Drawing.PointF]::new([float]($X + 24), [float]($Y + 4)),
      [System.Drawing.PointF]::new([float]($X + 27), [float]($Y + 8))
    )
  )
  Draw-LinePath $Graphics (New-RgbaColor 18 22 29 184) 1 $crackSegments
}

function Draw-Debris {
  param(
    [System.Drawing.Graphics]$Graphics,
    [double]$X,
    [double]$Y,
    $Definition,
    [int]$Variant
  )

  $layouts = @(
    @(@{ x = 4; y = 3; w = 5; h = 3 }, @{ x = 12; y = 2; w = 6; h = 4 }, @{ x = 22; y = 3; w = 4; h = 3 }),
    @(@{ x = 6; y = 2; w = 4; h = 4 }, @{ x = 14; y = 3; w = 5; h = 3 }, @{ x = 21; y = 2; w = 6; h = 4 }),
    @(@{ x = 5; y = 3; w = 6; h = 3 }, @{ x = 15; y = 1; w = 4; h = 5 }, @{ x = 23; y = 3; w = 3; h = 3 })
  )

  $pieces = $layouts[$Variant % $layouts.Count]
  $fill = New-HexColor $Definition.fill
  $accent = New-HexColor $Definition.accent
  $outline = New-RgbaColor 0 0 0 71
  foreach ($piece in $pieces) {
    Fill-Rect $Graphics $fill ($X + $piece.x) ($Y + $piece.y) $piece.w $piece.h
  }
  foreach ($piece in $pieces) {
    Fill-Rect $Graphics $accent ($X + $piece.x + 1) ($Y + $piece.y) ([Math]::Max(1, $piece.w - 2)) 1
  }
  foreach ($piece in $pieces) {
    Draw-Rect $Graphics $outline ($X + $piece.x) ($Y + $piece.y) ($piece.w - 1) ($piece.h - 1) 1
  }
}

function Draw-DamageCracks {
  param(
    [System.Drawing.Graphics]$Graphics,
    [double]$X,
    [double]$Y,
    [int]$CrackLevel
  )

  $segments = @(
    @(
      [System.Drawing.PointF]::new([float]($X + 16), [float]($Y + 3)),
      [System.Drawing.PointF]::new([float]($X + 14), [float]($Y + 10)),
      [System.Drawing.PointF]::new([float]($X + 11), [float]($Y + 16))
    ),
    @(
      [System.Drawing.PointF]::new([float]($X + 14), [float]($Y + 10)),
      [System.Drawing.PointF]::new([float]($X + 20), [float]($Y + 13))
    )
  )

  if ($CrackLevel -ge 2) {
    $segments += @(
      [System.Drawing.PointF]::new([float]($X + 11), [float]($Y + 16)),
      [System.Drawing.PointF]::new([float]($X + 12), [float]($Y + 23)),
      [System.Drawing.PointF]::new([float]($X + 9), [float]($Y + 29))
    )
    $segments += @(
      [System.Drawing.PointF]::new([float]($X + 20), [float]($Y + 13)),
      [System.Drawing.PointF]::new([float]($X + 22), [float]($Y + 19)),
      [System.Drawing.PointF]::new([float]($X + 26), [float]($Y + 24))
    )
    $segments += @(
      [System.Drawing.PointF]::new([float]($X + 11), [float]($Y + 16)),
      [System.Drawing.PointF]::new([float]($X + 6), [float]($Y + 18)),
      [System.Drawing.PointF]::new([float]($X + 4), [float]($Y + 24))
    )
  }

  if ($CrackLevel -ge 3) {
    $segments[1] += [System.Drawing.PointF]::new([float]($X + 25), [float]($Y + 10))
    $segments += @(
      [System.Drawing.PointF]::new([float]($X + 12), [float]($Y + 23)),
      [System.Drawing.PointF]::new([float]($X + 18), [float]($Y + 26)),
      [System.Drawing.PointF]::new([float]($X + 22), [float]($Y + 30))
    )
    $segments += @(
      [System.Drawing.PointF]::new([float]($X + 22), [float]($Y + 19)),
      [System.Drawing.PointF]::new([float]($X + 27), [float]($Y + 17))
    )
  }

  if ($CrackLevel -ge 4) {
    $segments += @(
      [System.Drawing.PointF]::new([float]($X + 10), [float]($Y + 8)),
      [System.Drawing.PointF]::new([float]($X + 6), [float]($Y + 11))
    )
    $segments += @(
      [System.Drawing.PointF]::new([float]($X + 17), [float]($Y + 6)),
      [System.Drawing.PointF]::new([float]($X + 23), [float]($Y + 4))
    )
    $segments += @(
      [System.Drawing.PointF]::new([float]($X + 7), [float]($Y + 25)),
      [System.Drawing.PointF]::new([float]($X + 4), [float]($Y + 29))
    )
    $segments += @(
      [System.Drawing.PointF]::new([float]($X + 25), [float]($Y + 24)),
      [System.Drawing.PointF]::new([float]($X + 28), [float]($Y + 28))
    )
  }

  Draw-LinePath $Graphics (New-RgbaColor 16 18 24 184) 1.5 $segments
}

function Draw-SurfaceTreatment {
  param(
    [System.Drawing.Graphics]$Graphics,
    [double]$X,
    [double]$Y,
    [int]$TileSize,
    [AllowNull()][string]$SurfaceTreatment,
    [int]$SurfaceVariant
  )

  switch ($SurfaceTreatment) {
    'grass' { Draw-GrassCap $Graphics $X $Y $TileSize $SurfaceVariant }
    'moss' { Draw-MossCap $Graphics $X $Y $TileSize }
    'rock' { Draw-RockCap $Graphics $X $Y $TileSize $false }
    'rock-spires' { Draw-RockCap $Graphics $X $Y $TileSize $true }
  }
}

$root = Split-Path -Parent $PSCommandPath
$tilesDir = Join-Path $root 'assets/tiles'
$terrainAtlasPath = Join-Path $tilesDir 'terrain-atlas.png'
$terrainManifestPath = Join-Path $tilesDir 'terrain-atlas-manifest.json'
$terrainManifestModulePath = Join-Path $tilesDir 'terrain-atlas-manifest.js'

$tileSize = 32
$overflowTop = 4
$tileHeight = $tileSize + $overflowTop
$magmaFrameCount = 6
$magmaAnimationFps = 6
$atlasPixelSize = 576
$atlasColumns = [int]($atlasPixelSize / $tileSize)
$atlasRows = [int]($atlasPixelSize / $tileHeight)

$surfaceVariants = @(
  @{ surfaceTreatment = $null; surfaceVariant = 0 },
  @{ surfaceTreatment = 'grass'; surfaceVariant = 0 },
  @{ surfaceTreatment = 'grass'; surfaceVariant = 1 },
  @{ surfaceTreatment = 'grass'; surfaceVariant = 2 },
  @{ surfaceTreatment = 'moss'; surfaceVariant = 0 },
  @{ surfaceTreatment = 'rock'; surfaceVariant = 0 },
  @{ surfaceTreatment = 'rock-spires'; surfaceVariant = 0 }
)

$tileDefinitions = @(
  [ordered]@{ type = 'chest'; sprite = @{ x = 0; y = 0 }; fill = '#70491f'; accent = '#f0c45a'; pattern = 'chest' },
  [ordered]@{ type = 'platform'; sprite = @{ x = 0; y = 0 }; fill = '#6f5031'; accent = '#d7b07b'; pattern = 'platform' },
  [ordered]@{ type = 'dirt'; sprite = @{ x = 0; y = 0 }; fill = '#7f5634'; accent = '#a1764b'; pattern = 'speck' },
  [ordered]@{ type = 'stone'; sprite = @{ x = 1; y = 0 }; fill = '#7d8799'; accent = '#b8c0cf'; pattern = 'bands' },
  [ordered]@{ type = 'shale'; sprite = @{ x = 4; y = 0 }; fill = '#5f6a7c'; accent = '#8993a8'; pattern = 'slate' },
  [ordered]@{ type = 'basalt'; sprite = @{ x = 5; y = 0 }; fill = '#3e4655'; accent = '#697388'; pattern = 'blocks' },
  [ordered]@{ type = 'magma'; sprite = @{ x = 0; y = 0 }; fill = '#2a1518'; accent = '#ff8b33'; pattern = 'magma' },
  [ordered]@{ type = 'coal'; sprite = @{ x = 2; y = 0 }; fill = '#3c353f'; accent = '#15131a'; pattern = 'ore-cluster' },
  [ordered]@{ type = 'copper'; sprite = @{ x = 6; y = 0 }; fill = '#8a6c5f'; accent = '#c97a43'; pattern = 'ore-cluster' },
  [ordered]@{ type = 'tin'; sprite = @{ x = 7; y = 0 }; fill = '#71808a'; accent = '#d7e1e8'; pattern = 'ore-cluster' },
  [ordered]@{ type = 'iron'; sprite = @{ x = 3; y = 0 }; fill = '#7a6f68'; accent = '#cf7449'; pattern = 'ore-cluster' },
  [ordered]@{ type = 'silver'; sprite = @{ x = 8; y = 0 }; fill = '#697386'; accent = '#d7dce6'; pattern = 'ore-gem' },
  [ordered]@{ type = 'gold'; sprite = @{ x = 9; y = 0 }; fill = '#77675b'; accent = '#e0ba4e'; pattern = 'ore-gem' },
  [ordered]@{ type = 'ruby'; sprite = @{ x = 10; y = 0 }; fill = '#5b4550'; accent = '#da4d68'; pattern = 'gem-shard' },
  [ordered]@{ type = 'sapphire'; sprite = @{ x = 11; y = 0 }; fill = '#435067'; accent = '#58a8ea'; pattern = 'gem-shard' }
)

function New-EntryList {
  return New-Object System.Collections.Generic.List[object]
}

function Add-EntriesToLayout {
  param(
    [System.Collections.Generic.List[object]]$LayoutEntries,
    [System.Collections.Generic.List[object]]$Entries,
    [int]$OriginColumn,
    [int]$OriginRow,
    [int]$Columns
  )

  for ($index = 0; $index -lt $Entries.Count; $index += 1) {
    $entry = $Entries[$index]
    $entry.atlasColumn = $OriginColumn + ($index % $Columns)
    $entry.atlasRow = $OriginRow + [Math]::Floor($index / $Columns)
    $LayoutEntries.Add($entry)
  }
}

$tileEntriesByType = @{}
$debrisEntriesByType = @{}
  foreach ($definition in $tileDefinitions) {
    $definitionEntries = New-EntryList
    $variants = if (Supports-SurfaceTreatment $definition.type) { $surfaceVariants } else { @(@{ surfaceTreatment = $null; surfaceVariant = 0 }) }
    $frameCount = if ($definition.type -eq 'magma') { $magmaFrameCount } else { 1 }
    for ($frame = 0; $frame -lt $frameCount; $frame += 1) {
      foreach ($variant in $variants) {
        $definitionEntries.Add([ordered]@{
          key = Build-TileKey $definition.type $variant.surfaceTreatment $variant.surfaceVariant $frame
          kind = 'tile'
          definition = $definition
          surfaceTreatment = $variant.surfaceTreatment
          surfaceVariant = $variant.surfaceVariant
          frame = $frame
        })
      }

    }

    $tileEntriesByType[$definition.type] = $definitionEntries
  }

  foreach ($definition in $tileDefinitions) {
    $definitionEntries = New-EntryList
    for ($variant = 0; $variant -lt 3; $variant += 1) {
      $definitionEntries.Add([ordered]@{ key = Build-DebrisKey $definition.type $variant 'ground'; kind = 'debris'; definition = $definition; variant = $variant; placement = 'ground' })
      $definitionEntries.Add([ordered]@{ key = Build-DebrisKey $definition.type $variant 'top'; kind = 'debris'; definition = $definition; variant = $variant; placement = 'top' })
    }

    $debrisEntriesByType[$definition.type] = $definitionEntries
  }

  $crackEntries = New-EntryList
  for ($crackLevel = 1; $crackLevel -le 4; $crackLevel += 1) {
    $crackEntries.Add([ordered]@{ key = Build-CrackKey $crackLevel; kind = 'crack'; crackLevel = $crackLevel })
  }

  $layoutEntries = New-EntryList
  Add-EntriesToLayout $layoutEntries $tileEntriesByType.chest 0 0 2
  Add-EntriesToLayout $layoutEntries $tileEntriesByType.platform 2 0 1
  Add-EntriesToLayout $layoutEntries $crackEntries 4 0 4
  Add-EntriesToLayout $layoutEntries $tileEntriesByType.magma 12 0 6

  Add-EntriesToLayout $layoutEntries $tileEntriesByType.dirt 0 1 4
  Add-EntriesToLayout $layoutEntries $tileEntriesByType.stone 4 1 4
  Add-EntriesToLayout $layoutEntries $tileEntriesByType.shale 8 1 4
  Add-EntriesToLayout $layoutEntries $tileEntriesByType.basalt 12 1 4

  Add-EntriesToLayout $layoutEntries $tileEntriesByType.coal 0 3 4
  Add-EntriesToLayout $layoutEntries $tileEntriesByType.copper 4 3 4
  Add-EntriesToLayout $layoutEntries $tileEntriesByType.tin 8 3 4
  Add-EntriesToLayout $layoutEntries $tileEntriesByType.iron 12 3 4

  Add-EntriesToLayout $layoutEntries $tileEntriesByType.silver 0 5 4
  Add-EntriesToLayout $layoutEntries $tileEntriesByType.gold 4 5 4
  Add-EntriesToLayout $layoutEntries $tileEntriesByType.ruby 8 5 4
  Add-EntriesToLayout $layoutEntries $tileEntriesByType.sapphire 12 5 4

  Add-EntriesToLayout $layoutEntries $debrisEntriesByType.chest 0 8 3
  Add-EntriesToLayout $layoutEntries $debrisEntriesByType.platform 3 8 3
  Add-EntriesToLayout $layoutEntries $debrisEntriesByType.dirt 6 8 3
  Add-EntriesToLayout $layoutEntries $debrisEntriesByType.stone 9 8 3
  Add-EntriesToLayout $layoutEntries $debrisEntriesByType.shale 12 8 3
  Add-EntriesToLayout $layoutEntries $debrisEntriesByType.basalt 15 8 3

  Add-EntriesToLayout $layoutEntries $debrisEntriesByType.magma 0 10 3
  Add-EntriesToLayout $layoutEntries $debrisEntriesByType.coal 3 10 3
  Add-EntriesToLayout $layoutEntries $debrisEntriesByType.copper 6 10 3
  Add-EntriesToLayout $layoutEntries $debrisEntriesByType.tin 9 10 3
  Add-EntriesToLayout $layoutEntries $debrisEntriesByType.iron 12 10 3
  Add-EntriesToLayout $layoutEntries $debrisEntriesByType.silver 15 10 3

  Add-EntriesToLayout $layoutEntries $debrisEntriesByType.gold 0 12 3
  Add-EntriesToLayout $layoutEntries $debrisEntriesByType.ruby 3 12 3
  Add-EntriesToLayout $layoutEntries $debrisEntriesByType.sapphire 6 12 3

  foreach ($entry in $layoutEntries) {
    if ($entry.atlasColumn -ge $atlasColumns -or $entry.atlasRow -ge $atlasRows) {
      throw "Atlas layout overflowed the configured square canvas."
    }
  }

  $atlasBitmap = [System.Drawing.Bitmap]::new($atlasPixelSize, $atlasPixelSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($atlasBitmap)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half

  try {
    $manifestEntries = [ordered]@{}

    for ($index = 0; $index -lt $layoutEntries.Count; $index += 1) {
      $entry = $layoutEntries[$index]
      $x = $entry.atlasColumn * $tileSize
      $y = $entry.atlasRow * $tileHeight
      $drawY = $y + $overflowTop
      $manifestEntries[$entry.key] = [ordered]@{ x = $x; y = $y }

      switch ($entry.kind) {
        'tile' {
          if ($entry.definition.type -eq 'magma') {
            Draw-TilePattern $graphics $entry.definition $x $drawY $tileSize ($entry.frame / $magmaAnimationFps) 0 0
          }
          else {
            Draw-TilePattern $graphics $entry.definition $x $drawY $tileSize 0 0 0
          }

          Draw-SurfaceTreatment $graphics $x $drawY $tileSize $entry.surfaceTreatment $entry.surfaceVariant
        }
        'debris' {
          $debrisY = if ($entry.placement -eq 'ground') { $y + $overflowTop + $tileSize - 8 } else { $drawY }
          Draw-Debris $graphics $x $debrisY $entry.definition $entry.variant
        }
        'crack' {
          Draw-DamageCracks $graphics $x $drawY $entry.crackLevel
        }
      }
    }

    $atlasBitmap.Save($terrainAtlasPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $manifest = [ordered]@{
      meta = [ordered]@{
        tileSize = $tileSize
        overflowTop = $overflowTop
        tileHeight = $tileHeight
        magmaFrames = $magmaFrameCount
        magmaAnimationFps = $magmaAnimationFps
        atlasPixelSize = $atlasPixelSize
      }
      entries = $manifestEntries
    }
    $manifestJson = $manifest | ConvertTo-Json -Depth 6
    Set-Content -Path $terrainManifestPath -Encoding utf8 -Value $manifestJson
    Set-Content -Path $terrainManifestModulePath -Encoding utf8 -Value @(
      'export const TERRAIN_ATLAS_MANIFEST =',
      $manifestJson,
      ';'
    )
  }
  finally {
    $graphics.Dispose()
    $atlasBitmap.Dispose()
  }

Write-Host "Generated terrain atlas: $terrainAtlasPath"
Write-Host "Generated terrain manifest: $terrainManifestPath"
Write-Host "Generated terrain manifest module: $terrainManifestModulePath"