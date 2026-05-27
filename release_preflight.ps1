param(
  [string]$DestinationRoot = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppName = "NM_web_imagen"
$VersionPath = Join-Path $ScriptDir "VERSION"
$StudioIndexPath = Join-Path $ScriptDir "static\studio\index.html"

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

function Write-Step {
  param([string]$Text)
  Write-Host ""
  Write-Host "== $Text =="
}

function New-TextFromCodes {
  param([int[]]$Codes)

  return [string]::Concat([char[]]$Codes)
}

function Get-DefaultDestinationRoot {
  $Segment1 = New-TextFromCodes @(65, 73, 20135, 20986, 24037, 20855, 25554, 20214)
  $Segment2 = New-TextFromCodes @(32654, 26415)
  $Segment3 = New-TextFromCodes @(29305, 25928, 32452)
  $Segment4 = New-TextFromCodes @(32593, 39029, 29983, 22270, 24037, 20855)
  return Join-Path "G:\su\doc\Tools" (Join-Path $Segment1 (Join-Path $Segment2 (Join-Path $Segment3 $Segment4)))
}

function Assert-PathMissing {
  param(
    [string]$Root,
    [string[]]$RelativePaths
  )

  foreach ($RelativePath in $RelativePaths) {
    $FullPath = Join-Path $Root $RelativePath
    if (Test-Path -LiteralPath $FullPath) {
      throw "Unexpected local artifact in release target: $RelativePath"
    }
  }
}

function Test-ZipClean {
  param(
    [string]$ZipPath,
    [string]$ExpectedJs,
    [string]$ExpectedCss
  )

  if (-not (Test-Path -LiteralPath $ZipPath)) {
    throw "Package was not found: $ZipPath"
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $Zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    $Names = @($Zip.Entries.FullName | ForEach-Object { $_ -replace "\\", "/" })
    if (-not ($Names -contains "$AppName/static/studio/assets/$ExpectedJs")) {
      throw "Package is missing expected Studio JS: $ExpectedJs"
    }
    if (-not ($Names -contains "$AppName/static/studio/assets/$ExpectedCss")) {
      throw "Package is missing expected Studio CSS: $ExpectedCss"
    }
    $BadPatterns = @(
      "^$AppName/config\.local\.json$",
      "^$AppName/outputs/",
      "^$AppName/logs/",
      "^$AppName/\.runtime/",
      "^$AppName/\.venv/",
      "^$AppName/\.playwright-mcp/",
      "^$AppName/__pycache__/",
      "^$AppName/studio-web/node_modules/",
      "^$AppName/studio-web/tsconfig\.tsbuildinfo$",
      "^$AppName/package_web_tool\.ps1$",
      "^$AppName/release_one_click\.ps1$",
      "^$AppName/release_preflight\.ps1$",
      "^$AppName/sync_release_to_g\.ps1$",
      "^$AppName/一键发布\.bat$",
      "^$AppName/(AGENTS|PROJECT_STATUS|NEXT_ACTIONS|DECISIONS)\.md$"
    )
    foreach ($Pattern in $BadPatterns) {
      if (($Names -match $Pattern).Count -gt 0) {
        throw "Package contains excluded content matching: $Pattern"
      }
    }
    foreach ($Entry in $Zip.Entries) {
      $EntryName = $Entry.FullName -replace "\\", "/"
      if ($EntryName -match "^$AppName/[^/]+\.bat$") {
        $Reader = New-Object System.IO.StreamReader($Entry.Open())
        try {
          $EntryText = $Reader.ReadToEnd()
          if ($EntryText -like "*release_one_click.ps1*") {
            throw "Package contains release batch launcher: $EntryName"
          }
        } finally {
          $Reader.Dispose()
        }
      }
    }
  } finally {
    $Zip.Dispose()
  }
}

if ([string]::IsNullOrWhiteSpace($DestinationRoot)) {
  $DestinationRoot = Get-DefaultDestinationRoot
}

Write-Step "Version"
if (-not (Test-Path -LiteralPath $VersionPath)) {
  throw "VERSION was not found."
}
$Version = (Get-Content -LiteralPath $VersionPath -Encoding UTF8 -TotalCount 1).Trim()
if ($Version -notmatch "^\d+\.\d+\.\d+$") {
  throw "VERSION must look like 1.0.3, got: $Version"
}
Write-Host "VERSION: $Version"

Write-Step "Studio assets"
if (-not (Test-Path -LiteralPath $StudioIndexPath)) {
  throw "Studio index was not found."
}
$StudioHtml = Get-Content -LiteralPath $StudioIndexPath -Encoding UTF8 -Raw
$AssetMatches = [regex]::Matches($StudioHtml, '(?:src|href)="([^"]*assets/[^"]+\.(?:js|css))"')
if ($AssetMatches.Count -lt 2) {
  throw "Studio index does not reference both JS and CSS assets."
}
$ExpectedJs = ""
$ExpectedCss = ""
foreach ($Match in $AssetMatches) {
  $AssetRef = $Match.Groups[1].Value
  if ($AssetRef.StartsWith("/")) {
    throw "Studio asset path is not file-openable: $AssetRef"
  }
  $AssetPath = Join-Path (Split-Path -Parent $StudioIndexPath) $AssetRef
  if (-not (Test-Path -LiteralPath $AssetPath)) {
    throw "Studio asset missing: $AssetRef"
  }
  if ($AssetRef -like "*.js") {
    $ExpectedJs = Split-Path -Leaf $AssetRef
  }
  if ($AssetRef -like "*.css") {
    $ExpectedCss = Split-Path -Leaf $AssetRef
  }
}
Write-Host "Studio JS: $ExpectedJs"
Write-Host "Studio CSS: $ExpectedCss"

Write-Step "Local release artifacts"
$VersionedZip = Join-Path $ScriptDir "..\$AppName-v$Version.zip"
Test-ZipClean -ZipPath $VersionedZip -ExpectedJs $ExpectedJs -ExpectedCss $ExpectedCss
Write-Host "Local versioned package OK: $VersionedZip"

Write-Step "G drive sync target"
$DestinationAppDir = Join-Path $DestinationRoot $AppName
$DestinationZip = Join-Path $DestinationRoot "$AppName-v$Version.zip"
if (-not (Test-Path -LiteralPath $DestinationAppDir)) {
  throw "G: sync folder was not found: $DestinationAppDir"
}
Assert-PathMissing -Root $DestinationAppDir -RelativePaths @(
  "config.local.json",
  "outputs",
  "logs",
  ".runtime",
  ".venv",
  ".playwright-mcp",
  "__pycache__",
  "studio-web\node_modules",
  "studio-web\tsconfig.tsbuildinfo",
  "AGENTS.md",
  "PROJECT_STATUS.md",
  "NEXT_ACTIONS.md",
  "DECISIONS.md"
)
Test-ZipClean -ZipPath $DestinationZip -ExpectedJs $ExpectedJs -ExpectedCss $ExpectedCss
Write-Host "G: clean folder OK: $DestinationAppDir"
Write-Host "G: versioned package OK: $DestinationZip"

Write-Step "Result"
Write-Host "Release preflight passed."
