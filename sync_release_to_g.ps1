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

function Get-CompanySharePathSuffix {
  $Segment1 = New-TextFromCodes @(65, 73, 20135, 20986, 24037, 20855, 25554, 20214)
  $Segment2 = New-TextFromCodes @(32654, 26415)
  $Segment3 = New-TextFromCodes @(29305, 25928, 32452)
  $Segment4 = New-TextFromCodes @(32593, 39029, 29983, 22270, 24037, 20855)
  return Join-Path $Segment1 (Join-Path $Segment2 (Join-Path $Segment3 $Segment4))
}

function Get-CompanyShareRootOptions {
  $Suffix = Get-CompanySharePathSuffix
  return @(
    [pscustomobject]@{
      Anchor = "G:\su\doc\Tools"
      Root = Join-Path "G:\su\doc\Tools" $Suffix
    },
    [pscustomobject]@{
      Anchor = "G:\doc\Tools"
      Root = Join-Path "G:\doc\Tools" $Suffix
    }
  )
}

function Get-CompanyShareRootCandidates {
  return @(Get-CompanyShareRootOptions | ForEach-Object { $_.Root })
}

function Resolve-CompanyShareRoot {
  param([string]$RequestedRoot)

  if (-not [string]::IsNullOrWhiteSpace($RequestedRoot)) {
    return $RequestedRoot
  }

  foreach ($Candidate in Get-CompanyShareRootCandidates) {
    if (Test-Path -LiteralPath $Candidate) {
      return $Candidate
    }
  }

  return (Get-CompanyShareRootCandidates)[0]
}

function Assert-AllowedCompanyShareRoot {
  param([string]$DestinationRoot)

  $ResolvedDestinationRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($DestinationRoot)
  foreach ($Option in Get-CompanyShareRootOptions) {
    $ResolvedOptionRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Option.Root)
    if ($ResolvedDestinationRoot.Equals($ResolvedOptionRoot, [StringComparison]::OrdinalIgnoreCase)) {
      if (-not (Test-Path -LiteralPath $Option.Anchor)) {
        throw "Refusing to create missing company share anchor: $($Option.Anchor)"
      }
      if (-not (Test-Path -LiteralPath $ResolvedDestinationRoot)) {
        throw "DestinationRoot is missing; refusing to create company release root: $ResolvedDestinationRoot"
      }
      return [pscustomobject]@{
        Anchor = $Option.Anchor
        Root = $ResolvedDestinationRoot
      }
    }
  }

  throw "Refusing to sync outside expected share root: $ResolvedDestinationRoot"
}

function Get-DefaultDestinationRoot {
  return Resolve-CompanyShareRoot -RequestedRoot ""
}

function Assert-CleanPackageZip {
  param([string]$ZipPath)

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $ForbiddenPatterns = @(
    "^$AppName/config\.local\.json$",
    "^$AppName/output/",
    "^$AppName/outputs/",
    "^$AppName/logs/",
    "^$AppName/\.chrome-debug/",
    "^$AppName/\.codex/",
    "^$AppName/\.git/",
    "^$AppName/\.svn/",
    "^$AppName/\.runtime/",
    "^$AppName/\.venv/",
    "^$AppName/\.playwright-mcp/",
    "^$AppName/_release/",
    "^$AppName/__pycache__/",
    "^$AppName/dist/",
    "^$AppName/node_modules/",
    "^$AppName/saved_images/",
    "^$AppName/tests/",
    "^$AppName/studio-web/",
    "^$AppName/package_web_tool\.ps1$",
    "^$AppName/release_one_click\.ps1$",
    "^$AppName/release_preflight\.ps1$",
    "^$AppName/sync_release_to_g\.ps1$",
    "^$AppName/(AGENTS|PROJECT_STATUS|NEXT_ACTIONS|DECISIONS)\.md$",
    "^$AppName/[^/]+\.(?:png|jpg|jpeg|webp)$",
    "^$AppName/.*\.(?:pyc|pyo|log|tmp|bak|old|7z|rar)$",
    "^$AppName/(?!vendor/python/python-[^/]+-embed-amd64\.zip$).*\.zip$",
    "^$AppName/(?:\.env[^/]*|credentials[^/]*|cookies[^/]*|.*(?:secret|token).*)$",
    "PixPin",
    "企业微信截图"
  )

  $Zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    $Names = @($Zip.Entries.FullName | ForEach-Object { $_ -replace "\\", "/" })
    foreach ($Name in $Names) {
      if (-not ($Name.StartsWith("$AppName/"))) {
        throw "Package entry is outside $AppName root: $Name"
      }
    }
    foreach ($Pattern in $ForbiddenPatterns) {
      if (($Names -match $Pattern).Count -gt 0) {
        throw "Package contains excluded content matching: $Pattern"
      }
    }
  } finally {
    $Zip.Dispose()
  }
}

$DestinationRoot = Resolve-CompanyShareRoot -RequestedRoot $DestinationRoot

$DestinationAppDir = Join-Path $DestinationRoot $AppName

$Version = (Get-Content -LiteralPath $VersionPath -Encoding UTF8 -TotalCount 1).Trim()
if ([string]::IsNullOrWhiteSpace($Version)) {
  throw "VERSION is empty."
}

$DestinationRootInfo = Assert-AllowedCompanyShareRoot -DestinationRoot $DestinationRoot
$DestinationRoot = $DestinationRootInfo.Root
$DestinationAppDir = Join-Path $DestinationRoot $AppName

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
  Assert-CleanPackageZip -ZipPath $TempZip

  if (Test-Path -LiteralPath $TempExtractRoot) {
    Remove-Item -LiteralPath $TempExtractRoot -Recurse -Force
  }
  Expand-Archive -LiteralPath $TempZip -DestinationPath $TempExtractRoot -Force
  if (-not (Test-Path -LiteralPath $TempAppDir)) {
    throw "Package did not contain $AppName root folder."
  }

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
