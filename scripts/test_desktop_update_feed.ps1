param(
  [Parameter(Mandatory = $true)][string]$PrivateKeyPath,
  [string]$PrivateKeyPassword = ""
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
$PrivateKeyResolved = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($PrivateKeyPath)
if (-not (Test-Path -LiteralPath $PrivateKeyResolved -PathType Leaf)) {
  throw "Updater private key was not found: $PrivateKeyResolved"
}

$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("nm_image_studio_update_feed_" + [guid]::NewGuid().ToString("N"))
$FeedRoot = Join-Path $TempRoot "feed"
$InstallerArtifact = Join-Path $TempRoot "NM-Image-Studio-v9.9.9-Updater-x64.nsis.zip"
$PortableArtifact = Join-Path $TempRoot "NM-Image-Studio-v9.9.9-Portable-x64.zip"

function Assert-Equal {
  param($Actual, $Expected, [string]$Label)
  if ($Actual -ne $Expected) {
    throw "$Label mismatch. Expected '$Expected', got '$Actual'."
  }
}

function Assert-True {
  param([bool]$Condition, [string]$Label)
  if (-not $Condition) {
    throw "Assertion failed: $Label"
  }
}

function Invoke-Signer {
  param([string]$ArtifactPath)
  $PreviousPassword = $env:TAURI_PRIVATE_KEY_PASSWORD
  try {
    $env:TAURI_PRIVATE_KEY_PASSWORD = $PrivateKeyPassword
    $Arguments = @("exec", "--offline", "--", "tauri", "signer", "sign", "-f", $PrivateKeyResolved)
    if ([string]::IsNullOrWhiteSpace($PrivateKeyPassword)) {
      $Arguments += "--password="
    } else {
      $Arguments += @("-p", $PrivateKeyPassword)
    }
    $Arguments += $ArtifactPath
    & npm @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Tauri signer failed for $ArtifactPath with exit code $LASTEXITCODE."
    }
  } finally {
    if ($null -eq $PreviousPassword) {
      Remove-Item Env:TAURI_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
    } else {
      $env:TAURI_PRIVATE_KEY_PASSWORD = $PreviousPassword
    }
  }
}

New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null
try {
  [System.IO.File]::WriteAllBytes($InstallerArtifact, [System.Text.Encoding]::UTF8.GetBytes("fake signed NSIS updater artifact"))
  [System.IO.File]::WriteAllBytes($PortableArtifact, [System.Text.Encoding]::UTF8.GetBytes("fake signed portable ZIP artifact"))

  Push-Location $StudioRoot
  try {
    Invoke-Signer -ArtifactPath $InstallerArtifact
    Invoke-Signer -ArtifactPath $PortableArtifact
  } finally {
    Pop-Location
  }

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ScriptDir "generate_desktop_update_feed.ps1") `
    -ReleaseVersion "9.9.9" `
    -InstallerUpdaterPath $InstallerArtifact `
    -InstallerSignaturePath ($InstallerArtifact + ".sig") `
    -PortablePath $PortableArtifact `
    -PortableSignaturePath ($PortableArtifact + ".sig") `
    -OutputDirectory $FeedRoot `
    -ReleaseBaseUrl "https://example.invalid/releases/v9.9.9" `
    -Notes "Updater feed smoke test"
  if ($LASTEXITCODE -ne 0) {
    throw "Feed generator failed with exit code $LASTEXITCODE."
  }

  $LatestPath = Join-Path $FeedRoot "latest.json"
  $PortableFeedPath = Join-Path $FeedRoot "portable-latest.json"
  foreach ($Path in @($LatestPath, $PortableFeedPath)) {
    $Bytes = [System.IO.File]::ReadAllBytes($Path)
    Assert-True ($Bytes.Length -gt 0) "$Path is not empty"
    Assert-Equal $Bytes[0] 123 "$Path starts with '{' and has no UTF-8 BOM"
  }

  $Latest = Get-Content -LiteralPath $LatestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $Portable = Get-Content -LiteralPath $PortableFeedPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $InstallerHash = (Get-FileHash -LiteralPath $InstallerArtifact -Algorithm SHA256).Hash.ToLowerInvariant()
  $PortableHash = (Get-FileHash -LiteralPath $PortableArtifact -Algorithm SHA256).Hash.ToLowerInvariant()

  Assert-Equal $Latest.version "9.9.9" "Installer feed version"
  Assert-Equal $Portable.version "9.9.9" "Portable feed version"
  Assert-Equal $Latest.sha256 $InstallerHash "Installer SHA256"
  Assert-Equal $Portable.sha256 $PortableHash "Portable SHA256"
  Assert-Equal $Latest.platforms.'windows-x86_64'.url "https://example.invalid/releases/v9.9.9/$([System.IO.Path]::GetFileName($InstallerArtifact))" "Installer URL"
  Assert-Equal $Portable.platforms.'windows-x86_64'.url "https://example.invalid/releases/v9.9.9/$([System.IO.Path]::GetFileName($PortableArtifact))" "Portable URL"
  Assert-True (-not [string]::IsNullOrWhiteSpace($Latest.platforms.'windows-x86_64'.signature)) "Installer signature exists"
  Assert-True (-not [string]::IsNullOrWhiteSpace($Portable.platforms.'windows-x86_64'.signature)) "Portable signature exists"

  Write-Host "Desktop updater feed smoke test passed."
} finally {
  if (Test-Path -LiteralPath $TempRoot) {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force
  }
}
