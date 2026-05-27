param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ParentDir = Split-Path -Parent $ScriptDir

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $ParentDir "NM_web_imagen.zip"
}

$OutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("nm_web_imagen_package_" + [System.Guid]::NewGuid().ToString("N"))
$TempAppDir = Join-Path $TempRoot "NM_web_imagen"

$ExcludedDirs = @(
  ".codex",
  ".chrome-debug",
  ".venv",
  ".runtime",
  ".playwright-mcp",
  ".git",
  ".svn",
  "_release",
  "__pycache__",
  "dist",
  "node_modules",
  "studio-web",
  "tests",
  "logs",
  "outputs",
  "saved_images"
)

$ExcludedFiles = @(
  "*.pyc",
  "*.pyo",
  "*.zip",
  "GwenImageGen.exe",
  "AGENTS.md",
  "PROJECT_STATUS.md",
  "NEXT_ACTIONS.md",
  "DECISIONS.md",
  "package_web_tool.ps1",
  "release_one_click.ps1",
  "release_preflight.ps1",
  "sync_release_to_g.ps1",
  "config.local.json",
  "tsconfig.tsbuildinfo",
  "page-check*.png",
  "release-check*.png",
  "ui-*.png",
  "gpt-image-playground-home.png",
  "server.err.log",
  "server.out.log"
)

function Test-IsExcludedFile {
  param(
    [System.IO.FileInfo]$File,
    [string]$RelativePath
  )

  $NormalizedRelativePath = $RelativePath -replace "\\", "/"
  if ($NormalizedRelativePath -like "vendor/python/python-*-embed-amd64.zip") {
    return $false
  }

  if ($NormalizedRelativePath -notlike "*/*") {
    if ($File.Extension -in @(".png", ".jpg", ".jpeg", ".webp")) {
      return $true
    }
  }

  if ($NormalizedRelativePath -like "vendor/wheels/*.whl") {
    $WheelName = $File.Name
    if (
      $WheelName -match "-cp(310|311|313)-" -or
      $WheelName -match "-cp(310|311|313)-cp(310|311|313)-"
    ) {
      return $true
    }
  }

  $Segments = $RelativePath -split "[\\/]"
  foreach ($Segment in $Segments) {
    if ($ExcludedDirs -contains $Segment) {
      return $true
    }
  }

  foreach ($Pattern in $ExcludedFiles) {
    if ($File.Name -like $Pattern) {
      return $true
    }
  }

  if ($NormalizedRelativePath -notlike "*/*" -and $File.Extension -ieq ".bat") {
    $BatText = Get-Content -LiteralPath $File.FullName -Raw -ErrorAction SilentlyContinue
    if ($BatText -like "*release_one_click.ps1*") {
      return $true
    }
  }

  return $false
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

if (Test-Path -LiteralPath $TempRoot) {
  Remove-Item -LiteralPath $TempRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $TempAppDir -Force | Out-Null

try {
  Get-ChildItem -LiteralPath $ScriptDir -Recurse -Force -File | ForEach-Object {
    $RelativePath = $_.FullName.Substring($ScriptDir.Length).TrimStart("\", "/")
    if (Test-IsExcludedFile -File $_ -RelativePath $RelativePath) {
      return
    }

    $TargetPath = Join-Path $TempAppDir $RelativePath
    $TargetDir = Split-Path -Parent $TargetPath
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $TargetPath -Force
  }

  Write-PackageReadme

  $OutputDir = Split-Path -Parent $OutputPath
  if (-not [string]::IsNullOrWhiteSpace($OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
  }

  if (Test-Path -LiteralPath $OutputPath) {
    Remove-Item -LiteralPath $OutputPath -Force
  }

  Compress-Archive -Path $TempAppDir -DestinationPath $OutputPath -Force
  Write-Host "Package created: $OutputPath"
  Write-Host "Win64 offline package: kept portable Python 3.12 and compatible wheels only."
  Write-Host "Excluded release scripts, development sources/tests, local config, outputs, logs, saved images, local .venv/.runtime, browser cache and Python cache."
} finally {
  if (Test-Path -LiteralPath $TempRoot) {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force
  }
}
