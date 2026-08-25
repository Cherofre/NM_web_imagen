param(
  [Parameter(Mandatory = $true)][string]$DestinationRoot,
  [string]$ReleaseDirectory = "",
  [string]$ReleaseVersion = ""
)

$ErrorActionPreference = "Stop"
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir ".."))
if ([string]::IsNullOrWhiteSpace($ReleaseDirectory)) {
  $ReleaseDirectory = Join-Path $RepoRoot "_release\desktop"
}
$ReleaseDirectory = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ReleaseDirectory)
if ([string]::IsNullOrWhiteSpace($ReleaseVersion)) {
  $ReleaseVersion = (Get-Content -LiteralPath (Join-Path $RepoRoot "VERSION") -Encoding UTF8 -TotalCount 1).Trim()
}
if ([string]::IsNullOrWhiteSpace($ReleaseVersion)) {
  throw "Release version is empty."
}

function New-TextFromCodes {
  param([int[]]$Codes)
  return [string]::Concat([char[]]$Codes)
}

$SafeVersion = $ReleaseVersion -replace '[^A-Za-z0-9._-]', '-'
$InstallLabel = New-TextFromCodes @(23433,35013,29256)
$OfflineLabel = New-TextFromCodes @(31163,32447,23433,35013,29256)
$PortableLabel = New-TextFromCodes @(20415,25658,29256)
$DesktopLabel = "NM Image Studio Desktop"
$PortableFolderLabel = "NM Image Studio"
$LauncherName = New-TextFromCodes @(21551,21160,32,78,77,32,73,109,97,103,101,32,83,116,117,100,105,111,46,98,97,116)
$SelectionName = New-TextFromCodes @(35828,26126,45,22914,20309,36873,25321,29256,26412,46,116,120,116)
$SourceFiles = [ordered]@{
  $InstallLabel = "NM-Image-Studio-v$SafeVersion-Setup-x64.exe"
  $OfflineLabel = "NM-Image-Studio-v$SafeVersion-Offline-WebView2-Setup-x64.exe"
  $PortableLabel = "NM-Image-Studio-v$SafeVersion-Portable-x64.zip"
}
foreach ($Name in $SourceFiles.Values) {
  $SourcePath = Join-Path $ReleaseDirectory $Name
  if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
    throw "Release artifact was not found: $SourcePath"
  }
}

$Root = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($DestinationRoot)
if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
  throw "Destination root does not exist: $Root"
}
$DistributionRoot = Join-Path $Root $DesktopLabel
$PortableRoot = Join-Path $DistributionRoot $PortableLabel
$PortableApp = Join-Path $PortableRoot $PortableFolderLabel
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("nm_image_studio_distribution_" + [guid]::NewGuid().ToString("N"))
$InternalNames = @(
  "latest.json",
  "portable-latest.json",
  "NM-Image-Studio-v$SafeVersion-Setup-x64.exe",
  "NM-Image-Studio-v$SafeVersion-Setup-x64.manifest.json",
  "NM-Image-Studio-v$SafeVersion-Setup-x64.sha256",
  "NM-Image-Studio-v$SafeVersion-Offline-WebView2-Setup-x64.exe",
  "NM-Image-Studio-v$SafeVersion-Offline-WebView2-Setup-x64.manifest.json",
  "NM-Image-Studio-v$SafeVersion-Offline-WebView2-Setup-x64.sha256",
  "NM-Image-Studio-v$SafeVersion-Portable-x64.zip",
  "NM-Image-Studio-v$SafeVersion-Portable-x64.zip.sig",
  "NM-Image-Studio-v$SafeVersion-Portable-x64.manifest.json",
  "NM-Image-Studio-v$SafeVersion-Portable-x64.sha256",
  "NM-Image-Studio-v$SafeVersion-Updater-x64.exe",
  "NM-Image-Studio-v$SafeVersion-Updater-x64.exe.sig"
)

function Write-Utf8NoBom {
  param([string]$Path, [string]$Content)
  $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
}

try {
  New-Item -ItemType Directory -Force -Path $DistributionRoot, $PortableRoot | Out-Null
  foreach ($InternalName in $InternalNames) {
    $InternalPath = Join-Path $DistributionRoot $InternalName
    if (Test-Path -LiteralPath $InternalPath -PathType Leaf) {
      Remove-Item -LiteralPath $InternalPath -Force
    }
  }
  foreach ($Label in $SourceFiles.Keys) {
    $SourceName = $SourceFiles[$Label]
    $SourcePath = Join-Path $ReleaseDirectory $SourceName
    $Suffix = switch ($Label) {
      $InstallLabel { "${InstallLabel}.exe" }
      $OfflineLabel { "${OfflineLabel}.exe" }
      $PortableLabel { "${PortableLabel}.zip" }
    }
    $TargetName = "NM Image Studio $ReleaseVersion $Suffix"
    $TargetPath = Join-Path $DistributionRoot $TargetName
    Copy-Item -LiteralPath $SourcePath -Destination $TargetPath -Force
  }

  New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null
  $PortableZip = Join-Path $ReleaseDirectory $SourceFiles[$PortableLabel]
  Expand-Archive -LiteralPath $PortableZip -DestinationPath $TempRoot -Force
  $ExtractedApp = Join-Path $TempRoot "NM Image Studio"
  if (-not (Test-Path -LiteralPath (Join-Path $ExtractedApp "nm-image-studio-desktop.exe") -PathType Leaf)) {
    throw "Portable ZIP does not contain the expected desktop executable."
  }
  if (Test-Path -LiteralPath $PortableApp) {
    Remove-Item -LiteralPath $PortableApp -Recurse -Force
  }
  Copy-Item -LiteralPath $ExtractedApp -Destination $PortableApp -Recurse -Force

  $Launcher = @(
    '@echo off',
    'setlocal',
    'cd /d "%~dp0NM Image Studio"',
    'start "NM Image Studio" "nm-image-studio-desktop.exe"',
    'endlocal'
  ) -join [Environment]::NewLine
  Write-Utf8NoBom -Path (Join-Path $PortableRoot $LauncherName) -Content $Launcher

  $Readme = @(
    "NM Image Studio Desktop v$ReleaseVersion",
    "",
    (New-TextFromCodes @(25991,20214,36873,25321,65306)),
    (New-TextFromCodes @(45,32,23433,35013,29256,65306,27491,24120,23433,35013,65292,36866,21512,38271,26399,20351,29992,12290)),
    (New-TextFromCodes @(45,32,31163,32447,23433,35013,29256,65306,20869,32622,32,87,101,98,86,105,101,119,50,65292,36866,21512,26032,30005,33041,25110,26080,32593,32476,23433,35013,12290)),
    (New-TextFromCodes @(45,32,20415,25658,29256,65306,19981,23433,35013,21040,31995,32479,65292,25171,24320,8220,20415,25658,29256,92,21551,21160,32,78,77,32,73,109,97,103,101,32,83,116,117,100,105,111,46,98,97,116,8221,21363,21487,20351,29992,12290)),
    "",
    (New-TextFromCodes @(20415,25658,29256,21319,32423,26102,35831,20445,30041,8220,20415,25658,29256,92,78,77,32,73,109,97,103,101,32,83,116,117,100,105,111,92,100,97,116,97,8221,25991,20214,22841,12290)),
    "",
    (New-TextFromCodes @(20851,20110,26356,26032,22120,65306,26356,26032,22120,19981,26159,26085,24120,21551,21160,31243,24207,12290,26700,38754,29256,22312,8220,35774,32622,32,8594,32,20851,20110,32,8594,32,26816,26597,26356,26032,8221,26102,65292,20250,33258,21160,26816,26597,31614,21517,24182,35843,29992,23427,23436,25104,23433,35013,29256,21319,32423,65307,20415,25658,29256,21017,19979,36733,26032,30340,32,90,73,80,65292,30001,29992,25143,20851,38381,31243,24207,21518,26367,25442,25991,20214,12290))
  ) -join [Environment]::NewLine
  Write-Utf8NoBom -Path (Join-Path $DistributionRoot $SelectionName) -Content $Readme

  Write-Host "Desktop distribution prepared: $DistributionRoot"
  Write-Host "Portable app extracted: $PortableApp"
} finally {
  if (Test-Path -LiteralPath $TempRoot) {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force
  }
}
