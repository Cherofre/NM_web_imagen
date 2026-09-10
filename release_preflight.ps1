param(
  [string]$DestinationRoot = "",
  [string]$ExpectedVersion = "",
  [switch]$LocalOnly
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

function Get-ForbiddenReleasePatterns {
  return @(
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
    "^$AppName/studio-web/node_modules/",
    "^$AppName/studio-web/tsconfig\.tsbuildinfo$",
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
}

function Get-StreamSha256 {
  param([System.IO.Stream]$Stream)

  $Sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $Hash = $Sha.ComputeHash($Stream)
    return ([BitConverter]::ToString($Hash)).Replace("-", "").ToLowerInvariant()
  } finally {
    $Sha.Dispose()
  }
}

function Get-FileSha256 {
  param([string]$Path)

  $Stream = [System.IO.File]::OpenRead($Path)
  try {
    return Get-StreamSha256 -Stream $Stream
  } finally {
    $Stream.Dispose()
  }
}

function Test-TextClean {
  param(
    [string]$Name,
    [string]$Text
  )

  $BadTokens = @(
    "package_web_tool.ps1",
    "release_one_click.ps1",
    "release_package_smoke.ps1",
    "release_preflight.ps1",
    "sync_release_to_g.ps1",
    "C:\Users\mumengfei",
    "C:\Users\",
    "I:\AI\",
    "G:\su\",
    "D:\Documents\",
    "D:\Program Files\PixPin",
    "WecomData",
    "PixPin",
    "企业微信截图"
  )

  foreach ($Token in $BadTokens) {
    if ($Text.Contains($Token)) {
      throw "Package text contains development or local token in ${Name}: $Token"
    }
  }
}

function Get-ZipFileManifest {
  param([string]$ZipPath)

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $Zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    $Rows = @()
    foreach ($Entry in $Zip.Entries) {
      $Name = $Entry.FullName -replace "\\", "/"
      if ($Name.EndsWith("/")) {
        continue
      }
      if (-not $Name.StartsWith("$AppName/")) {
        throw "Package entry is outside $AppName root: $Name"
      }
      $EntryStream = $Entry.Open()
      try {
        $EntryHash = Get-StreamSha256 -Stream $EntryStream
      } finally {
        $EntryStream.Dispose()
      }
      $Rows += [pscustomobject]@{
        Path = $Name.Substring($AppName.Length + 1)
        Length = [int64]$Entry.Length
        Hash = $EntryHash
      }
    }
    return @($Rows | Sort-Object Path)
  } finally {
    $Zip.Dispose()
  }
}

function Get-DirectoryFileManifest {
  param([string]$Root)

  $ResolvedRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Root)
  $PrefixLength = $ResolvedRoot.TrimEnd("\", "/").Length + 1
  return @(Get-ChildItem -LiteralPath $ResolvedRoot -Recurse -Force -File | ForEach-Object {
    [pscustomobject]@{
      Path = ($_.FullName.Substring($PrefixLength) -replace "\\", "/")
      Length = [int64]$_.Length
      Hash = Get-FileSha256 -Path $_.FullName
    }
  } | Sort-Object Path)
}

function Assert-DirectoryMatchesZip {
  param(
    [string]$Root,
    [string]$ZipPath
  )

  $ZipManifest = @(Get-ZipFileManifest -ZipPath $ZipPath)
  $DirManifest = @(Get-DirectoryFileManifest -Root $Root)
  $ZipByPath = @{}
  $DirByPath = @{}

  foreach ($Item in $ZipManifest) {
    $ZipByPath[$Item.Path] = $Item.Length
  }
  foreach ($Item in $DirManifest) {
    $DirByPath[$Item.Path] = $Item.Length
  }

  foreach ($Path in $ZipByPath.Keys) {
    if (-not $DirByPath.ContainsKey($Path)) {
      throw "G: sync folder is missing package file: $Path"
    }
    if ($DirByPath[$Path] -ne $ZipByPath[$Path]) {
      throw "G: sync folder file size differs from package: $Path"
    }
    $ZipItem = $ZipManifest | Where-Object { $_.Path -eq $Path } | Select-Object -First 1
    $DirItem = $DirManifest | Where-Object { $_.Path -eq $Path } | Select-Object -First 1
    if ($ZipItem.Hash -ne $DirItem.Hash) {
      throw "G: sync folder file hash differs from package: $Path"
    }
  }
  foreach ($Path in $DirByPath.Keys) {
    if (-not $ZipByPath.ContainsKey($Path)) {
      throw "G: sync folder contains extra file not in package: $Path"
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
    $RelativeManifest = @(Get-ZipRelativeManifest -Zip $Zip)
    $Names = @($Zip.Entries.FullName | ForEach-Object { $_ -replace "\\", "/" })
    if (-not ($RelativeManifest -ccontains "static/studio/assets/$ExpectedJs")) {
      throw "Package is missing expected Studio JS: $ExpectedJs"
    }
    if (-not ($RelativeManifest -ccontains "static/studio/assets/$ExpectedCss")) {
      throw "Package is missing expected Studio CSS: $ExpectedCss"
    }

    foreach ($Pattern in (Get-ForbiddenReleasePatterns)) {
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
          Test-TextClean -Name $EntryName -Text $EntryText
        } finally {
          $Reader.Dispose()
        }
      } elseif ($EntryName -match "\.(?:ps1|py|js|css|html|md|json|ts|tsx|mjs|txt|gitignore|svnignore)$" -and $Entry.Length -le 2097152) {
        $Reader = New-Object System.IO.StreamReader($Entry.Open())
        try {
          Test-TextClean -Name $EntryName -Text $Reader.ReadToEnd()
        } finally {
          $Reader.Dispose()
        }
      }
    }

    if (-not ($Names -contains "$AppName/README.md")) {
      throw "Package is missing README.md"
    }
  } finally {
    $Zip.Dispose()
  }
}

Write-Step "Version"
if (-not (Test-Path -LiteralPath $VersionPath)) {
  throw "VERSION was not found."
}
$Version = (Get-Content -LiteralPath $VersionPath -Encoding UTF8 -TotalCount 1).Trim()
if ($Version -notmatch "^\d+\.\d+\.\d+$") {
  throw "VERSION must look like semantic version x.y.z, got: $Version"
}
if (-not [string]::IsNullOrWhiteSpace($ExpectedVersion) -and $Version -ne $ExpectedVersion) {
  throw "VERSION expected $ExpectedVersion, got: $Version"
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
$VersionedZip = Join-Path $ScriptDir "_release\web\$AppName-v$Version-Web-x64.zip"
if (-not (Test-Path -LiteralPath $VersionedZip -PathType Leaf)) {
  $VersionedZip = Join-Path $ScriptDir "_release\web\$AppName-v$Version.zip"
}
if (-not (Test-Path -LiteralPath $VersionedZip -PathType Leaf)) {
  # Keep compatibility with the historical one-click web package location.
  $VersionedZip = Join-Path $ScriptDir "..\$AppName-v$Version.zip"
}
Test-ZipClean -ZipPath $VersionedZip -ExpectedJs $ExpectedJs -ExpectedCss $ExpectedCss
$LocalZipHash = Get-FileSha256 -Path $VersionedZip
Write-Host "Local versioned package OK: $VersionedZip"
Write-Host "Local versioned package SHA256: $LocalZipHash"

if ($LocalOnly) {
  Write-Step "Result"
  Write-Host "Local release preflight passed."
  exit 0
}

$DestinationRoot = Resolve-CompanyShareRoot -RequestedRoot $DestinationRoot
$DestinationRootInfo = Assert-AllowedCompanyShareRoot -DestinationRoot $DestinationRoot
$DestinationRoot = $DestinationRootInfo.Root

Write-Step "G drive sync target"
$DestinationAppDir = Join-Path $DestinationRoot $AppName
$DestinationZip = Join-Path $DestinationRoot "$AppName-v$Version.zip"
if (-not (Test-Path -LiteralPath $DestinationAppDir)) {
  throw "G: sync folder was not found: $DestinationAppDir"
}
Test-ZipClean -ZipPath $DestinationZip -ExpectedJs $ExpectedJs -ExpectedCss $ExpectedCss
$DestinationZipHash = Get-FileSha256 -Path $DestinationZip
if ($DestinationZipHash -ne $LocalZipHash) {
  throw "G: versioned package hash differs from local package."
}
Assert-DirectoryMatchesZip -Root $DestinationAppDir -ZipPath $DestinationZip
Write-Host "G: clean folder OK: $DestinationAppDir"
Write-Host "G: versioned package OK: $DestinationZip"
Write-Host "G: versioned package SHA256: $DestinationZipHash"

Write-Step "Result"
Write-Host "Release preflight passed."
