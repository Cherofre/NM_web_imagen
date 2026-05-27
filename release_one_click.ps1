param(
  [string]$DestinationRoot = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$StudioDir = Join-Path $ScriptDir "studio-web"
$PreflightScript = Join-Path $ScriptDir "release_preflight.ps1"
$SyncScript = Join-Path $ScriptDir "sync_release_to_g.ps1"

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

Invoke-Step "Frontend tests" {
  Push-Location $StudioDir
  try {
    node --test .\src\configProfiles.test.mjs .\src\configProfileSelection.test.mjs .\src\generationQueue.test.mjs .\src\queuePersistence.test.mjs .\src\queueSessionBoundaries.test.mjs .\src\sessionDrafts.test.mjs .\src\submissionPayload.test.mjs .\src\uiPolish.test.mjs .\src\gptSizeSelection.test.mjs
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

Invoke-Step "Package and sync" {
  $Args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $SyncScript)
  if (-not [string]::IsNullOrWhiteSpace($DestinationRoot)) {
    $Args += @("-DestinationRoot", $DestinationRoot)
  }
  powershell @Args
}

Invoke-Step "Release preflight" {
  $Args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PreflightScript)
  if (-not [string]::IsNullOrWhiteSpace($DestinationRoot)) {
    $Args += @("-DestinationRoot", $DestinationRoot)
  }
  powershell @Args
}

Write-Host ""
Write-Host "One-click release finished."
