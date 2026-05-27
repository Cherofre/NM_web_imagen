param(
  [string]$DestinationRoot = "",
  [switch]$SkipPackage
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VersionPath = Join-Path $ScriptDir "VERSION"
$PackageScript = Join-Path $ScriptDir "package_web_tool.ps1"
$AppName = "NM_web_imagen"

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

if (-not (Test-Path -LiteralPath $VersionPath)) {
  throw "VERSION was not found."
}
if (-not (Test-Path -LiteralPath $PackageScript)) {
  throw "package_web_tool.ps1 was not found."
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

if ([string]::IsNullOrWhiteSpace($DestinationRoot)) {
  $DestinationRoot = Get-DefaultDestinationRoot
}

$DestinationAppDir = Join-Path $DestinationRoot $AppName

$Version = (Get-Content -LiteralPath $VersionPath -Encoding UTF8 -TotalCount 1).Trim()
if ([string]::IsNullOrWhiteSpace($Version)) {
  throw "VERSION is empty."
}

$ResolvedDestinationRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($DestinationRoot)
$ExpectedSuffix = Get-DefaultDestinationRoot
if (-not $ResolvedDestinationRoot.Equals($ExpectedSuffix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to sync outside expected share root: $ResolvedDestinationRoot"
}

$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("nm_web_imagen_sync_" + [System.Guid]::NewGuid().ToString("N"))
$TempZip = Join-Path $TempRoot "$AppName.zip"
$TempExtractRoot = Join-Path $TempRoot "extract"
$TempAppDir = Join-Path $TempExtractRoot $AppName
$VersionedZip = Join-Path $ScriptDir "..\$AppName-v$Version.zip"

try {
  New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null

  if (-not $SkipPackage) {
    powershell -NoProfile -ExecutionPolicy Bypass -File $PackageScript -OutputPath $TempZip
  } else {
    if (-not (Test-Path -LiteralPath $VersionedZip)) {
      throw "SkipPackage was set, but versioned package was not found: $VersionedZip"
    }
    Copy-Item -LiteralPath $VersionedZip -Destination $TempZip -Force
  }

  if (Test-Path -LiteralPath $TempExtractRoot) {
    Remove-Item -LiteralPath $TempExtractRoot -Recurse -Force
  }
  Expand-Archive -LiteralPath $TempZip -DestinationPath $TempExtractRoot -Force
  if (-not (Test-Path -LiteralPath $TempAppDir)) {
    throw "Package did not contain $AppName root folder."
  }

  New-Item -ItemType Directory -Path $DestinationRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $DestinationAppDir -Force | Out-Null

  robocopy $TempAppDir $DestinationAppDir /MIR /R:2 /W:1 /XD .git .svn | Out-Host
  $RoboExit = $LASTEXITCODE
  if ($RoboExit -ge 8) {
    throw "robocopy failed with exit code $RoboExit"
  }

  Copy-Item -LiteralPath $TempZip -Destination $VersionedZip -Force
  Copy-Item -LiteralPath $TempZip -Destination (Join-Path $DestinationRoot "$AppName-v$Version.zip") -Force

  Write-Host "Synced clean package folder: $DestinationAppDir"
  Write-Host "Updated local package:"
  Write-Host "  $VersionedZip"
  Write-Host "Updated share package:"
  Write-Host "  $(Join-Path $DestinationRoot "$AppName-v$Version.zip")"
} finally {
  if (Test-Path -LiteralPath $TempRoot) {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force
  }
}
