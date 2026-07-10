param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ParentDir = Split-Path -Parent $ScriptDir
$AppName = "NM_web_imagen"
$VersionPath = Join-Path $ScriptDir "VERSION"
$Version = if (Test-Path -LiteralPath $VersionPath) { (Get-Content -LiteralPath $VersionPath -Encoding UTF8 -TotalCount 1).Trim() } else { "" }

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  if ([string]::IsNullOrWhiteSpace($Version)) {
    throw "VERSION is empty or missing; pass -OutputPath explicitly."
  }
  $OutputPath = Join-Path $ParentDir "$AppName-v$Version.zip"
}

$OutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("nm_web_imagen_package_" + [System.Guid]::NewGuid().ToString("N"))
$TempAppDir = Join-Path $TempRoot $AppName

$ReleaseFiles = @(
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
  "一键停止.bat"
)

$ReleaseTreeRoots = @(
  "static",
  "vendor"
)

function Get-RequiredReleaseManifestFiles {
  $Paths = @("README.md")
  $Paths += $ReleaseFiles
  $Paths += @(
    "static/index.html",
    "static/styles.css",
    "static/app.js",
    "static/studio/index.html",
    "vendor/python/python-3.12.10-embed-amd64.zip"
  )
  return @($Paths)
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

function Assert-ManifestEquals {
  param(
    [string[]]$Expected,
    [string[]]$Actual,
    [string]$Name
  )

  Assert-ReleaseRelativeManifest -Paths $Expected
  Assert-ReleaseRelativeManifest -Paths $Actual
  $ActualSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  foreach ($Path in $Actual) {
    [void]$ActualSet.Add(($Path -replace "\\", "/"))
  }
  if ($Expected.Count -ne $Actual.Count) {
    throw "$Name manifest count differs: expected $($Expected.Count), got $($Actual.Count)."
  }
  foreach ($Path in $Expected) {
    if (-not $ActualSet.Contains(($Path -replace "\\", "/"))) {
      throw "$Name manifest is missing expected file: $Path"
    }
  }
}

function Get-ReleaseTreeManifest {
  $ScriptRoot = $ScriptDir.TrimEnd("\", "/")
  $PrefixLength = $ScriptRoot.Length + 1
  $Paths = @()
  foreach ($RootName in $ReleaseTreeRoots) {
    $RootPath = Join-Path $ScriptDir $RootName
    if (-not (Test-Path -LiteralPath $RootPath -PathType Container)) {
      throw "Required release tree is missing: $RootName"
    }
    Get-ChildItem -LiteralPath $RootPath -Recurse -Force -File | ForEach-Object {
      $Paths += $_.FullName.Substring($PrefixLength) -replace "\\", "/"
    }
  }
  return @($Paths | Sort-Object)
}

function Get-DirectoryRelativeManifest {
  param([string]$Root)

  $ResolvedRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Root).TrimEnd("\", "/")
  $PrefixLength = $ResolvedRoot.Length + 1
  return @(Get-ChildItem -LiteralPath $ResolvedRoot -Recurse -Force -File | ForEach-Object {
    $_.FullName.Substring($PrefixLength) -replace "\\", "/"
  } | Sort-Object)
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

function Write-PackageReadme {
  $ReadmePath = Join-Path $TempAppDir "README.md"
  $Readme = @(
    "# NM_web_imagen",
    "",
    "Portable local web image generation tool.",
    "",
    "## Start",
    "",
    "1. Extract the whole NM_web_imagen folder.",
    "2. Double-click start_web.bat, or the Chinese one-click start batch file.",
    "3. When the browser opens, fill in your own API key, API base URL, and model name in the configuration panel.",
    "4. To stop the tool, close the startup console window or run stop_web.bat.",
    "",
    "Default URL:",
    "",
    "```text",
    "http://127.0.0.1:7861",
    "```",
    "",
    "## Offline runtime",
    "",
    "This package includes portable Python 3.12 for Windows x64 and offline wheels. The target computer does not need a system Python installation. The first launch creates a local .runtime folder.",
    "",
    "## Local-only files",
    "",
    "These files may be created while using the tool and belong only to the current computer:",
    "",
    "- config.local.json: local connection settings and API keys",
    "- outputs/: generated images, history, sessions, and reference snapshots",
    "- logs/: runtime logs",
    "- .runtime/: extracted portable Python runtime cache",
    "",
    "Do not manually add these local-only files when sharing the package.",
    "",
    "## Config compatibility",
    "",
    "A config.local.json from version 1.0.2 can still be used. The current version adapts old single-profile settings into the new profile format while keeping legacy fields for compatibility."
  ) -join [Environment]::NewLine
  Set-Content -LiteralPath $ReadmePath -Value $Readme -Encoding UTF8
}

function Get-ForbiddenPackagePatterns {
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
    "^$AppName/(?:\.env[^/]*|credentials[^/]*|cookies[^/]*|.*(?:secret|token).*)$"
  )
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
    "C:\Users\",
    "I:\AI\",
    "G:\su\",
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

function Test-PackageZipClean {
  param(
    [string]$ZipPath,
    [string[]]$ExpectedManifest = @()
  )

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $Zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    $RelativeManifest = @(Get-ZipRelativeManifest -Zip $Zip)
    if ($ExpectedManifest.Count -gt 0) {
      Assert-ManifestEquals -Expected $ExpectedManifest -Actual $RelativeManifest -Name "ZIP"
    }
    $Names = @($Zip.Entries.FullName | ForEach-Object { $_ -replace "\\", "/" })

    foreach ($Pattern in (Get-ForbiddenPackagePatterns)) {
      if (($Names -match $Pattern).Count -gt 0) {
        throw "Package contains excluded content matching: $Pattern"
      }
    }

    foreach ($Entry in $Zip.Entries) {
      $EntryName = $Entry.FullName -replace "\\", "/"
      if ($EntryName.EndsWith("/")) {
        continue
      }
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
  } finally {
    $Zip.Dispose()
  }
}

if (Test-Path -LiteralPath $TempRoot) {
  Remove-Item -LiteralPath $TempRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $TempAppDir -Force | Out-Null

try {
  if (Test-Path -LiteralPath $OutputPath) {
    Remove-Item -LiteralPath $OutputPath -Force
  }

  foreach ($RelativePath in $ReleaseFiles) {
    $SourcePath = Join-Path $ScriptDir $RelativePath
    if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
      throw "Required release file is missing: $RelativePath"
    }
  }

  $TreeManifest = @(Get-ReleaseTreeManifest)
  $ExpectedManifest = @("README.md") + $ReleaseFiles + $TreeManifest
  Assert-ReleaseRelativeManifest -Paths $ExpectedManifest

  foreach ($RelativePath in @($ReleaseFiles + $TreeManifest)) {
    $SourcePath = Join-Path $ScriptDir ($RelativePath -replace "/", "\")
    $TargetPath = Join-Path $TempAppDir ($RelativePath -replace "/", "\")
    $TargetDir = Split-Path -Parent $TargetPath
    if (-not [string]::IsNullOrWhiteSpace($TargetDir)) {
      New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    }
    Copy-Item -LiteralPath $SourcePath -Destination $TargetPath -Force
  }

  Write-PackageReadme
  $StagedManifest = @(Get-DirectoryRelativeManifest -Root $TempAppDir)
  Assert-ManifestEquals -Expected $ExpectedManifest -Actual $StagedManifest -Name "Staged directory"

  $OutputDir = Split-Path -Parent $OutputPath
  if (-not [string]::IsNullOrWhiteSpace($OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
  }

  Compress-Archive -Path $TempAppDir -DestinationPath $OutputPath -Force
  Test-PackageZipClean -ZipPath $OutputPath -ExpectedManifest $ExpectedManifest
  Write-Host "Package created: $OutputPath"
  Write-Host "Win64 offline package: copied only the exact release manifest."
  Write-Host "Release scripts, tests, ledgers, local config, outputs, logs, saved images, local .venv/.runtime and browser caches remain outside the package."
} catch {
  if (Test-Path -LiteralPath $OutputPath) {
    Remove-Item -LiteralPath $OutputPath -Force -ErrorAction SilentlyContinue
  }
  throw
} finally {
  if (Test-Path -LiteralPath $TempRoot) {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force
  }
}
