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

$ReleaseTrees = @(
  "static",
  "vendor"
)

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
  param([string]$ZipPath)

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $Zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    $Names = @($Zip.Entries.FullName | ForEach-Object { $_ -replace "\\", "/" })
    foreach ($Name in $Names) {
      if (-not ($Name.StartsWith("$AppName/"))) {
        throw "Package entry is outside $AppName root: $Name"
      }
    }

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
  foreach ($RelativePath in $ReleaseFiles) {
    $SourcePath = Join-Path $ScriptDir $RelativePath
    if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
      throw "Required release file is missing: $RelativePath"
    }
    Copy-Item -LiteralPath $SourcePath -Destination (Join-Path $TempAppDir $RelativePath) -Force
  }

  foreach ($RelativePath in $ReleaseTrees) {
    $SourcePath = Join-Path $ScriptDir $RelativePath
    if (-not (Test-Path -LiteralPath $SourcePath -PathType Container)) {
      throw "Required release tree is missing: $RelativePath"
    }
    Copy-Item -LiteralPath $SourcePath -Destination $TempAppDir -Recurse -Force
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
  Test-PackageZipClean -ZipPath $OutputPath
  Write-Host "Package created: $OutputPath"
  Write-Host "Win64 offline package: copied only the explicit release files and trees."
  Write-Host "Release scripts, tests, ledgers, local config, outputs, logs, saved images, local .venv/.runtime and browser caches remain outside the package."
} finally {
  if (Test-Path -LiteralPath $TempRoot) {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force
  }
}
