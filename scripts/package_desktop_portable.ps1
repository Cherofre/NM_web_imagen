param(
  [string]$OutputPath = "",
  [string]$ReleaseVersion = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir ".."))
$StudioRoot = Join-Path $RepoRoot "studio-web"
$TauriRoot = Join-Path $StudioRoot "src-tauri"
$ReleaseRoot = Join-Path $TauriRoot "target\release"
$DesktopExe = Join-Path $ReleaseRoot "nm-image-studio-desktop.exe"
$BackendDir = Join-Path $ReleaseRoot "backend"
$TauriConfigPath = Join-Path $TauriRoot "tauri.conf.json"

if ([string]::IsNullOrWhiteSpace($ReleaseVersion)) {
  if (-not (Test-Path -LiteralPath $TauriConfigPath -PathType Leaf)) {
    throw "Tauri config was not found: $TauriConfigPath"
  }
  $ReleaseVersion = ((Get-Content -LiteralPath $TauriConfigPath -Raw -Encoding UTF8) | ConvertFrom-Json).version
}
if ([string]::IsNullOrWhiteSpace($ReleaseVersion)) {
  throw "Release version is empty. Pass -ReleaseVersion explicitly."
}

$SafeVersion = $ReleaseVersion -replace '[^A-Za-z0-9._-]', '-'
$PackageName = "NM-Image-Studio-v$SafeVersion-Portable-x64"
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $RepoRoot "_release\desktop\$PackageName.zip"
}
$OutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$OutputDir = Split-Path -Parent $OutputPath
$ManifestPath = Join-Path $OutputDir "$PackageName.manifest.json"
$ShaPath = Join-Path $OutputDir "$PackageName.sha256"
$StageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("nm_image_studio_portable_" + [guid]::NewGuid().ToString("N"))
$StageApp = Join-Path $StageRoot "NM Image Studio"

function Get-RelativeFiles {
  param([string]$Root)
  $ResolvedRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd("\", "/")
  $PrefixLength = $ResolvedRoot.Length + 1
  return @(Get-ChildItem -LiteralPath $ResolvedRoot -Recurse -Force -File | ForEach-Object {
    $_.FullName.Substring($PrefixLength) -replace "\\", "/"
  } | Sort-Object)
}

function Copy-DirectoryContents {
  param([string]$Source, [string]$Destination)
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $Destination $_.Name) -Recurse -Force
  }
}

function Write-PortableReadme {
  $Readme = @(
    '# NM Image Studio Desktop',
    '',
    'Windows x64 portable package. Extract the whole folder and run nm-image-studio-desktop.exe.',
    '',
    '## Data',
    '',
    'The portable build stores config, history, logs and generated images in the data folder next to the EXE. Keep that folder when upgrading.',
    '',
    '## Requirements',
    '',
    '- Windows 10/11 x64',
    '- Microsoft Edge WebView2 Evergreen Runtime',
    '- Python, Node.js and Rust are not required',
    '',
    'If WebView2 is missing, the app shows a startup message with this install entry:',
    'https://developer.microsoft.com/microsoft-edge/webview2/',
    '',
    '## Backend debug',
    '',
    'The backend console is hidden by default. Open it from Desktop Settings > Storage and logs > Open debug window.',
    '',
    '## Files',
    '',
    'portable.mode enables portable storage; backend contains the FastAPI runtime; data is created on first launch.'
  ) -join [Environment]::NewLine
  Set-Content -LiteralPath (Join-Path $StageApp "README-Portable.txt") -Value $Readme -Encoding UTF8
}

function Get-FileEntries {
  param([string]$Root)
  $Entries = @()
  foreach ($RelativePath in (Get-RelativeFiles -Root $Root)) {
    $FullPath = Join-Path $Root ($RelativePath -replace "/", "\")
    $Hash = (Get-FileHash -LiteralPath $FullPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $Entries += [ordered]@{
      path = $RelativePath
      size = (Get-Item -LiteralPath $FullPath).Length
      sha256 = $Hash
    }
  }
  return @($Entries)
}

if (Test-Path -LiteralPath $StageRoot) {
  Remove-Item -LiteralPath $StageRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $StageApp | Out-Null

try {
  if (-not $SkipBuild) {
    Push-Location $StudioRoot
    try {
      & npm run desktop:build
      if ($LASTEXITCODE -ne 0) {
        throw "Tauri desktop build failed with exit code $LASTEXITCODE."
      }
    } finally {
      Pop-Location
    }
  }

  if (-not (Test-Path -LiteralPath $DesktopExe -PathType Leaf)) {
    throw "Desktop EXE was not found: $DesktopExe"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $BackendDir "nm-image-studio-backend.exe") -PathType Leaf)) {
    throw "Release backend directory is missing or incomplete: $BackendDir"
  }

  Copy-Item -LiteralPath $DesktopExe -Destination (Join-Path $StageApp "nm-image-studio-desktop.exe") -Force
  Copy-DirectoryContents -Source $BackendDir -Destination (Join-Path $StageApp "backend")
  New-Item -ItemType File -Force -Path (Join-Path $StageApp "portable.mode") | Out-Null
  Write-PortableReadme

  $Entries = @(Get-FileEntries -Root $StageApp)
  $Manifest = [ordered]@{
    product = "NM Image Studio"
    version = $ReleaseVersion
    package = $PackageName + ".zip"
    architecture = "x64"
    mode = "desktop-portable"
    webview2 = "system-evergreen-required"
    files = $Entries
  }

  if (-not (Test-Path -LiteralPath $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
  }
  foreach ($Path in @($OutputPath, $ManifestPath, $ShaPath)) {
    if (Test-Path -LiteralPath $Path) {
      Remove-Item -LiteralPath $Path -Force
    }
  }

  Compress-Archive -Path $StageApp -DestinationPath $OutputPath -Force
  $ZipHash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $Manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8
  Set-Content -LiteralPath $ShaPath -Value "$ZipHash  $([System.IO.Path]::GetFileName($OutputPath))" -Encoding ASCII

  Write-Host "Portable package created: $OutputPath"
  Write-Host "Manifest: $ManifestPath"
  Write-Host "SHA256: $ShaPath"
  Write-Host "Files: $($Entries.Count)"
} finally {
  if (Test-Path -LiteralPath $StageRoot) {
    Remove-Item -LiteralPath $StageRoot -Recurse -Force
  }
}
