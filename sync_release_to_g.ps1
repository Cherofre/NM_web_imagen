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

function Get-StandaloneShareRoot {
  $FolderName = New-TextFromCodes @(32593, 39029, 29983, 22270, 31449)
  return Join-Path "G:\doc\Tools" $FolderName
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
    },
    [pscustomobject]@{
      Anchor = "G:\doc\Tools"
      Root = Get-StandaloneShareRoot
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

function Get-RequiredReleaseManifestFiles {
  return @(
    "README.md",
    "app.py",
    "image_safety.py",
    "storage.py",
    "upstream.py",
    "requirements.txt",
    "VERSION",
    "config.example.json",
    "start_web.ps1",
    "stop_web.ps1",
    "start_web.bat",
    "stop_web.bat",
    "一键启动.bat",
    "一键停止.bat",
    "static/index.html",
    "static/styles.css",
    "static/app.js",
    "static/studio/index.html",
    "vendor/python/python-3.12.10-embed-amd64.zip"
  )
}

function Assert-ReleaseRelativeManifest {
  param([string[]]$Paths)

  $Required = @(Get-RequiredReleaseManifestFiles)
  $Exact = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  $CaseInsensitive = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $AssetJsCount = 0
  $AssetCssCount = 0
  $WheelCount = 0

  foreach ($RawPath in @($Paths)) {
    if ([string]::IsNullOrWhiteSpace($RawPath)) {
      throw "Release manifest contains an empty path."
    }
    $Path = $RawPath -replace "\\", "/"
    if ($Path.StartsWith("/") -or $Path -match "^[A-Za-z]:") {
      throw "Release manifest contains an absolute or drive path: $RawPath"
    }
    $Segments = @($Path -split "/")
    if ($Segments -contains "" -or $Segments -contains "." -or $Segments -contains "..") {
      throw "Release manifest contains an ambiguous path: $RawPath"
    }
    if (-not $Exact.Add($Path)) {
      throw "Release manifest contains a duplicate path: $Path"
    }
    if (-not $CaseInsensitive.Add($Path)) {
      throw "Release manifest contains a case-insensitive path collision: $Path"
    }
    if ($Required -ccontains $Path) {
      continue
    }
    if ($Path -cmatch "^static/studio/assets/index-[A-Za-z0-9_-]+\.js$") {
      $AssetJsCount += 1
      continue
    }
    if ($Path -cmatch "^static/studio/assets/index-[A-Za-z0-9_-]+\.css$") {
      $AssetCssCount += 1
      continue
    }
    if ($Path -cmatch "^static/studio/assets/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.(js|css)$") {
      continue
    }
    if ($Path -cmatch "^vendor/wheels/[^/]+\.whl$") {
      $WheelCount += 1
      continue
    }
    throw "Release manifest contains an unknown file: $Path"
  }
  foreach ($RequiredPath in $Required) {
    if (-not $Exact.Contains($RequiredPath)) {
      throw "Release manifest is missing required file: $RequiredPath"
    }
  }
  if ($AssetJsCount -lt 1) {
    throw "Release manifest must contain at least one Studio index-*.js asset."
  }
  if ($AssetCssCount -lt 1) {
    throw "Release manifest must contain at least one Studio index-*.css asset."
  }
  if ($WheelCount -lt 1) {
    throw "Release manifest must contain at least one vendor wheel."
  }
}

function Get-ZipRelativeManifest {
  param([System.IO.Compression.ZipArchive]$Zip)

  $ExactEntries = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  $CaseInsensitiveEntries = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $AllowedDirectories = @(
    "$AppName/",
    "$AppName/static/",
    "$AppName/static/studio/",
    "$AppName/static/studio/assets/",
    "$AppName/vendor/",
    "$AppName/vendor/python/",
    "$AppName/vendor/wheels/"
  )
  $Paths = @()
  foreach ($Entry in $Zip.Entries) {
    $RawName = [string]$Entry.FullName
    if ([string]::IsNullOrWhiteSpace($RawName)) {
      throw "Package contains an empty ZIP entry name."
    }
    $Name = $RawName -replace "\\", "/"
    if ($Name.StartsWith("/") -or $Name -match "^[A-Za-z]:") {
      throw "Package contains an absolute or drive ZIP path: $RawName"
    }
    $SegmentPath = $Name.TrimEnd([char]"/")
    $Segments = @($SegmentPath -split "/")
    if ($Segments -contains "" -or $Segments -contains "." -or $Segments -contains "..") {
      throw "Package contains an ambiguous ZIP path: $RawName"
    }
    if (-not $ExactEntries.Add($Name)) {
      throw "Package contains a duplicate ZIP path: $Name"
    }
    if (-not $CaseInsensitiveEntries.Add($Name)) {
      throw "Package contains a case-insensitive ZIP path collision: $Name"
    }
    if (-not $Name.StartsWith("$AppName/", [StringComparison]::Ordinal)) {
      throw "Package entry is outside $AppName root: $Name"
    }
    if ($Name.EndsWith("/")) {
      if ($AllowedDirectories -cnotcontains $Name) {
        throw "Package contains an unknown directory entry: $Name"
      }
      continue
    }
    $RelativePath = $Name.Substring($AppName.Length + 1)
    if ([string]::IsNullOrWhiteSpace($RelativePath)) {
      throw "Package contains an empty relative file path."
    }
    $Paths += $RelativePath
  }
  Assert-ReleaseRelativeManifest -Paths $Paths
  return @($Paths | Sort-Object)
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
    "^$AppName/\.playwright-cli/",
    "^$AppName/_release/",
    "^$AppName/__pycache__/",
    "^$AppName/dist/",
    "^$AppName/node_modules/",
    "^$AppName/saved_images/",
    "^$AppName/tests/",
    "^$AppName/studio-web/",
    "^$AppName/package_web_tool\.ps1$",
    "^$AppName/release_one_click\.ps1$",
    "^$AppName/release_package_smoke\.ps1$",
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
    [void](Get-ZipRelativeManifest -Zip $Zip)
    $Names = @($Zip.Entries.FullName | ForEach-Object { $_ -replace "\\", "/" })
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
