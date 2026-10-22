# Extrae los elementos aprobados de la lámina, sin redibujar el símbolo ni el texto.
# El archivo logo-original.png es una referencia distinta y no se usa para estos recursos.
Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $repoRoot 'public/identidad-visual.png'
$outputDir = Join-Path $repoRoot 'public/branding'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

function Get-Crop($source, [int]$x, [int]$y, [int]$width, [int]$height) {
  $crop = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($crop)
  try {
    $graphics.DrawImage($source,
      [System.Drawing.Rectangle]::new(0, 0, $width, $height),
      [System.Drawing.Rectangle]::new($x, $y, $width, $height),
      [System.Drawing.GraphicsUnit]::Pixel)
  } finally { $graphics.Dispose() }
  return $crop
}

function Remove-PanelBackground($bitmap, [string]$variant) {
  for ($y = 0; $y -lt $bitmap.Height; $y++) {
    for ($x = 0; $x -lt $bitmap.Width; $x++) {
      $pixel = $bitmap.GetPixel($x, $y)
      if ($variant -eq 'light') {
        $difference = 255 - [Math]::Min($pixel.R, [Math]::Min($pixel.G, $pixel.B))
        $alpha = [Math]::Max(0, [Math]::Min(255, [int](($difference - 14) * 255 / 42)))
      } else {
        $difference = [Math]::Max($pixel.R - 40, [Math]::Max($pixel.G - 78, $pixel.B - 115))
        $alpha = [Math]::Max(0, [Math]::Min(255, [int]($difference * 255 / 45)))
      }
      $bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $pixel.R, $pixel.G, $pixel.B))
    }
  }
}

function Remove-IconExterior($bitmap) {
  $visited = [System.Array]::CreateInstance([bool], [int[]]@($bitmap.Width, $bitmap.Height))
  $queue = [System.Collections.Generic.Queue[System.Drawing.Point]]::new()
  for ($x = 0; $x -lt $bitmap.Width; $x++) {
    $queue.Enqueue([System.Drawing.Point]::new($x, 0))
    $queue.Enqueue([System.Drawing.Point]::new($x, $bitmap.Height - 1))
  }
  for ($y = 0; $y -lt $bitmap.Height; $y++) {
    $queue.Enqueue([System.Drawing.Point]::new(0, $y))
    $queue.Enqueue([System.Drawing.Point]::new($bitmap.Width - 1, $y))
  }
  while ($queue.Count -gt 0) {
    $point = $queue.Dequeue()
    $x = $point.X
    $y = $point.Y
    if ($x -lt 0 -or $y -lt 0 -or $x -ge $bitmap.Width -or $y -ge $bitmap.Height -or $visited[$x, $y]) { continue }
    $visited[$x, $y] = $true
    $pixel = $bitmap.GetPixel($x, $y)
    if ([Math]::Min($pixel.R, [Math]::Min($pixel.G, $pixel.B)) -lt 224) { continue }
    $bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $pixel.R, $pixel.G, $pixel.B))
    $queue.Enqueue([System.Drawing.Point]::new($x - 1, $y))
    $queue.Enqueue([System.Drawing.Point]::new($x + 1, $y))
    $queue.Enqueue([System.Drawing.Point]::new($x, $y - 1))
    $queue.Enqueue([System.Drawing.Point]::new($x, $y + 1))
  }
}

function Save-Png($bitmap, [string]$fileName) {
  $bitmap.Save((Join-Path $outputDir $fileName), [System.Drawing.Imaging.ImageFormat]::Png)
}

function Save-SquareIcon($source, [int]$size, [string]$fileName) {
  $result = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($result)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.DrawImage($source, [System.Drawing.Rectangle]::new(0, 0, $size, $size))
  } finally { $graphics.Dispose() }
  try { Save-Png $result $fileName } finally { $result.Dispose() }
}

function Save-MaskableIcon($symbol, [int]$size, [string]$fileName) {
  $result = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($result)
  try {
    $graphics.Clear([System.Drawing.Color]::FromArgb(3, 27, 49))
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $symbolSize = [int]($size * 0.625)
    $offset = [int](($size - $symbolSize) / 2)
    $graphics.DrawImage($symbol, [System.Drawing.Rectangle]::new($offset, $offset, $symbolSize, $symbolSize))
  } finally { $graphics.Dispose() }
  try { Save-Png $result $fileName } finally { $result.Dispose() }
}

$source = [System.Drawing.Bitmap]::new($sourcePath)
try {
  $regions = @(
    @{ name = 'nexo-lockup-light.png'; x = 149; y = 40; width = 495; height = 325; variant = 'light' },
    @{ name = 'nexo-lockup-dark.png'; x = 916; y = 40; width = 485; height = 325; variant = 'dark' },
    @{ name = 'nexo-horizontal-light.png'; x = 110; y = 810; width = 540; height = 128; variant = 'light' },
    @{ name = 'nexo-horizontal-dark.png'; x = 906; y = 810; width = 544; height = 128; variant = 'dark' },
    @{ name = 'nexo-symbol-light.png'; x = 848; y = 476; width = 221; height = 217; variant = 'light' },
    @{ name = 'nexo-symbol-dark.png'; x = 1269; y = 476; width = 211; height = 217; variant = 'dark' }
  )
  foreach ($region in $regions) {
    $crop = Get-Crop $source $region.x $region.y $region.width $region.height
    try {
      Remove-PanelBackground $crop $region.variant
      Save-Png $crop $region.name
    } finally { $crop.Dispose() }
  }

  $icon = Get-Crop $source 82 468 236 236
  try {
    Remove-IconExterior $icon
    Save-SquareIcon $icon 512 'nexo-icon-512.png'
    Save-SquareIcon $icon 192 'nexo-icon-192.png'
    Save-SquareIcon $icon 48 'nexo-icon-48.png'
    Save-SquareIcon $icon 32 'nexo-favicon-32.png'
  } finally { $icon.Dispose() }

  $maskableSymbol = Get-Crop $source 1269 476 211 217
  try {
    Remove-PanelBackground $maskableSymbol 'dark'
    Save-MaskableIcon $maskableSymbol 512 'nexo-maskable-512.png'
  } finally { $maskableSymbol.Dispose() }
} finally { $source.Dispose() }
