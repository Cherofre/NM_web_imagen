param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ParentDir = Split-Path -Parent $ScriptDir

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $ParentDir "web_imagen_tool.zip"
}

$OutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("web_tool_package_" + [System.Guid]::NewGuid().ToString("N"))
$TempWebTool = Join-Path $TempRoot "web_imagen_tool"

$ExcludedDirs = @(
  ".chrome-debug",
  ".venv",
  ".runtime",
  ".playwright-mcp",
  ".git",
  ".svn",
  "__pycache__",
  "dist",
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
  "config.local.json",
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

  return $false
}

if (Test-Path -LiteralPath $TempRoot) {
  Remove-Item -LiteralPath $TempRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $TempWebTool -Force | Out-Null

try {
  Get-ChildItem -LiteralPath $ScriptDir -Recurse -Force -File | ForEach-Object {
    $RelativePath = $_.FullName.Substring($ScriptDir.Length).TrimStart("\", "/")
    if (Test-IsExcludedFile -File $_ -RelativePath $RelativePath) {
      return
    }

    $TargetPath = Join-Path $TempWebTool $RelativePath
    $TargetDir = Split-Path -Parent $TargetPath
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $TargetPath -Force
  }

  $OutputDir = Split-Path -Parent $OutputPath
  if (-not [string]::IsNullOrWhiteSpace($OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
  }

  if (Test-Path -LiteralPath $OutputPath) {
    Remove-Item -LiteralPath $OutputPath -Force
  }

  Compress-Archive -Path $TempWebTool -DestinationPath $OutputPath -Force
  Write-Host "Package created: $OutputPath"
  Write-Host "Win64 offline package: kept portable Python 3.12 and compatible wheels only."
  Write-Host "Excluded local config, outputs, logs, saved images, local .venv/.runtime, browser cache and Python cache."
} finally {
  if (Test-Path -LiteralPath $TempRoot) {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force
  }
}
