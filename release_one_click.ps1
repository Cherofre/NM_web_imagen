param(
  [string]$DestinationRoot = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$StudioDir = Join-Path $ScriptDir "studio-web"
$VersionPath = Join-Path $ScriptDir "VERSION"
$PackageScript = Join-Path $ScriptDir "package_web_tool.ps1"
$SmokeScript = Join-Path $ScriptDir "release_package_smoke.ps1"
$PreflightScript = Join-Path $ScriptDir "release_preflight.ps1"
$SyncScript = Join-Path $ScriptDir "sync_release_to_g.ps1"
$AppName = "NM_web_imagen"

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

function Invoke-Step {
  param(
    [string]$Title,
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "================================"
  Write-Host $Title
  Write-Host "================================"
  $global:LASTEXITCODE = 0
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Title failed with exit code $LASTEXITCODE"
  }
}

if (-not (Test-Path -LiteralPath $PreflightScript)) {
  throw "release_preflight.ps1 was not found."
}
if (-not (Test-Path -LiteralPath $SyncScript)) {
  throw "sync_release_to_g.ps1 was not found."
}
if (-not (Test-Path -LiteralPath $PackageScript)) {
  throw "package_web_tool.ps1 was not found."
}
if (-not (Test-Path -LiteralPath $SmokeScript)) {
  throw "release_package_smoke.ps1 was not found."
}
if (-not (Test-Path -LiteralPath $VersionPath)) {
  throw "VERSION was not found."
}

$Version = (Get-Content -LiteralPath $VersionPath -Encoding UTF8 -TotalCount 1).Trim()
$VersionedZip = Join-Path $ScriptDir "..\$AppName-v$Version.zip"

Invoke-Step "Frontend tests" {
  Push-Location $StudioDir
  try {
    node --test .\src\configProfiles.test.mjs .\src\configProfileSelection.test.mjs .\src\generationQueue.test.mjs .\src\queuePersistence.test.mjs .\src\queueSessionBoundaries.test.mjs .\src\sessionDrafts.test.mjs .\src\submissionPayload.test.mjs .\src\uiPolish.test.mjs .\src\gptSizeSelection.test.mjs .\src\i18n.test.mjs
  } finally {
    Pop-Location
  }
}

Invoke-Step "Frontend build" {
  Push-Location $StudioDir
  try {
    npm run build
  } finally {
    Pop-Location
  }
}

Invoke-Step "Backend checks" {
  $env:PYTHONUTF8 = "1"
  python -m py_compile .\app.py
  python -m unittest tests.test_studio_sessions tests.test_release_cache_busting
}

Invoke-Step "Package clean zip" {
  powershell -NoProfile -ExecutionPolicy Bypass -File $PackageScript -OutputPath $VersionedZip
}

Invoke-Step "Package smoke" {
  powershell -NoProfile -ExecutionPolicy Bypass -File $SmokeScript -ZipPath $VersionedZip
}

Invoke-Step "Local release preflight" {
  powershell -NoProfile -ExecutionPolicy Bypass -File $PreflightScript -ExpectedVersion $Version -LocalOnly
}

Invoke-Step "Sync clean package" {
  $Args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $SyncScript)
  if (-not [string]::IsNullOrWhiteSpace($DestinationRoot)) {
    $Args += @("-DestinationRoot", $DestinationRoot)
  }
  $Args += "-SkipPackage"
  powershell @Args
}

Invoke-Step "Destination verification" {
  $Args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PreflightScript)
  if (-not [string]::IsNullOrWhiteSpace($DestinationRoot)) {
    $Args += @("-DestinationRoot", $DestinationRoot)
  }
  $Args += @("-ExpectedVersion", $Version)
  powershell @Args
}

Write-Host ""
Write-Host "One-click release finished."
