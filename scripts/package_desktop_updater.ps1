param(
  [string]$OutputDirectory = "",
  [string]$ReleaseVersion = "",
  [Parameter(Mandatory = $true)][string]$PrivateKeyPath,
  [string]$PrivateKeyPassword = "",
  [string]$ReleaseNotes = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
if ($SkipBuild) {
  throw "Signed updater -SkipBuild is unsafe: the shared NSIS directory may retain a signature for replaced bytes. Run a fresh signed build."
}
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir ".."))
$StudioRoot = Join-Path $RepoRoot "studio-web"
$TauriRoot = Join-Path $StudioRoot "src-tauri"
$BundleDir = Join-Path $TauriRoot "target\release\bundle\nsis"
$PrivateKeyResolved = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($PrivateKeyPath)
if (-not (Test-Path -LiteralPath $PrivateKeyResolved -PathType Leaf)) {
  throw "Updater private key was not found: $PrivateKeyResolved"
}

. (Join-Path $ScriptDir "release_validation.ps1")
$ReleaseVersion = Get-ValidatedReleaseVersion -RepoRoot $RepoRoot -ExpectedVersion $ReleaseVersion

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path $RepoRoot "_release\desktop\updater"
}
$OutputDirectory = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

if (-not $SkipBuild) {
  $previousKey = $env:TAURI_SIGNING_PRIVATE_KEY
  $previousPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
  try {
    $env:TAURI_SIGNING_PRIVATE_KEY = $PrivateKeyResolved
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $PrivateKeyPassword
    Push-Location $StudioRoot
    try {
      & npm exec -- tauri build --config .\src-tauri\tauri.installer.updater.conf.json --bundles nsis --ci
      if ($LASTEXITCODE -ne 0) {
        throw "Tauri updater build failed with exit code $LASTEXITCODE."
      }
    } finally {
      Pop-Location
    }
  } finally {
    if ($null -eq $previousKey) { Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue } else { $env:TAURI_SIGNING_PRIVATE_KEY = $previousKey }
    if ($null -eq $previousPassword) { Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue } else { $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $previousPassword }
  }
}

$SnapshotRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("nm_signed_updater_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $SnapshotRoot | Out-Null
try {
  $Installer = Get-ChildItem -LiteralPath $BundleDir -Filter "*_${ReleaseVersion}_x64-setup.exe" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $Updater = $Installer
  if ($null -eq $Installer) {
    throw "NSIS setup artifact was not found in $BundleDir"
  }
  $UpdaterSignature = Get-Item -LiteralPath ($Updater.FullName + ".sig") -ErrorAction SilentlyContinue
  if ($null -eq $UpdaterSignature) {
    throw "Updater signature was not found beside $($Updater.Name)"
  }

  $InstallerOutput = Join-Path $OutputDirectory "NM-Image-Studio-v$ReleaseVersion-Setup-x64.exe"
  $UpdaterOutput = Join-Path $OutputDirectory "NM-Image-Studio-v$ReleaseVersion-Updater-x64.exe"
  $UpdaterSignatureOutput = $UpdaterOutput + ".sig"

  # Protect the signed bytes before another build replaces the shared NSIS output.
  $SnapshotUpdater = Join-Path $SnapshotRoot $Updater.Name
  $SnapshotSignature = $SnapshotUpdater + ".sig"
  Copy-Item -LiteralPath $Updater.FullName -Destination $SnapshotUpdater
  Copy-Item -LiteralPath $UpdaterSignature.FullName -Destination $SnapshotSignature

  # The updater build emits a signed NSIS setup executable. Keep that artifact
  # separate from the ordinary installer package: the ordinary Setup manifest
  # and SHA256 must describe the unsigned online-bootstrapper build, not the
  # updater copy. If the ordinary package is missing, build it explicitly.
  if (-not (Test-Path -LiteralPath $InstallerOutput -PathType Leaf)) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\package_desktop_installer.ps1") `
      -OutputPath $InstallerOutput `
      -ReleaseVersion $ReleaseVersion
    if ($LASTEXITCODE -ne 0) {
      throw "Ordinary desktop Setup package failed with exit code $LASTEXITCODE."
    }
  }
  Copy-Item -LiteralPath $SnapshotUpdater -Destination $UpdaterOutput -Force
  Copy-Item -LiteralPath $SnapshotSignature -Destination $UpdaterSignatureOutput -Force

  $PortableOutput = Join-Path $OutputDirectory "NM-Image-Studio-v$ReleaseVersion-Portable-x64.zip"
  Push-Location $StudioRoot
  try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\package_desktop_portable.ps1") -OutputPath $PortableOutput -ReleaseVersion $ReleaseVersion -SkipBuild
    if ($LASTEXITCODE -ne 0) { throw "Portable package failed with exit code $LASTEXITCODE." }
    $SignerArgs = @("exec", "--offline", "--", "tauri", "signer", "sign", "-f", $PrivateKeyResolved)
    if ([string]::IsNullOrWhiteSpace($PrivateKeyPassword)) {
      $SignerArgs += "--password="
    } else {
      $SignerArgs += @("-p", $PrivateKeyPassword)
    }
    $SignerArgs += $PortableOutput
    & npm @SignerArgs
    if ($LASTEXITCODE -ne 0) { throw "Portable package signing failed with exit code $LASTEXITCODE." }
  } finally {
    Pop-Location
  }

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts\generate_desktop_update_feed.ps1") `
    -ReleaseVersion $ReleaseVersion `
    -InstallerUpdaterPath $UpdaterOutput `
    -InstallerSignaturePath $UpdaterSignatureOutput `
    -PortablePath $PortableOutput `
    -PortableSignaturePath ($PortableOutput + ".sig") `
    -OutputDirectory $OutputDirectory `
    -Notes $ReleaseNotes
  if ($LASTEXITCODE -ne 0) { throw "Desktop update feed generation failed with exit code $LASTEXITCODE." }

  Write-Host "Signed desktop update artifacts created in $OutputDirectory"
} finally {
  $TempPrefix = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  $SnapshotRoot = [System.IO.Path]::GetFullPath($SnapshotRoot)
  if (-not $SnapshotRoot.StartsWith($TempPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing snapshot cleanup outside temp: $SnapshotRoot"
  }
  if (Test-Path -LiteralPath $SnapshotRoot) {
    Remove-Item -LiteralPath $SnapshotRoot -Recurse -Force
  }
}
