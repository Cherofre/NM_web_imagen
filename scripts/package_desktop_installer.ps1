param(
  [string]$OutputPath = "",
  [string]$ReleaseVersion = "",
  [switch]$OfflineWebView2
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
$TauriConfigPath = Join-Path $TauriRoot "tauri.conf.json"
$BundleDir = Join-Path $TauriRoot "target\release\bundle\nsis"

if ([string]::IsNullOrWhiteSpace($ReleaseVersion)) {
  $ReleaseVersion = ((Get-Content -LiteralPath $TauriConfigPath -Raw -Encoding UTF8) | ConvertFrom-Json).version
}
if ([string]::IsNullOrWhiteSpace($ReleaseVersion)) {
  throw "Release version is empty. Pass -ReleaseVersion explicitly."
}

$SafeVersion = $ReleaseVersion -replace '[^A-Za-z0-9._-]', '-'
$Kind = if ($OfflineWebView2) { "Offline-WebView2-Setup" } else { "Setup" }
$PackageName = "NM-Image-Studio-v$SafeVersion-$Kind-x64"
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $RepoRoot "_release\desktop\$PackageName.exe"
}
$OutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$OutputDir = Split-Path -Parent $OutputPath
$ManifestPath = Join-Path $OutputDir "$PackageName.manifest.json"
$ShaPath = Join-Path $OutputDir "$PackageName.sha256"
$ConfigOverride = if ($OfflineWebView2) {
  Join-Path $TauriRoot "tauri.installer.offline.conf.json"
} else {
  Join-Path $TauriRoot "tauri.installer.online.conf.json"
}

Push-Location $StudioRoot
try {
  & npm exec -- tauri build --config $ConfigOverride --bundles nsis --ci --no-sign
  if ($LASTEXITCODE -ne 0) {
    throw "Tauri installer build failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

$Installer = Get-ChildItem -LiteralPath $BundleDir -Filter "*-setup.exe" -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if ($null -eq $Installer) {
  throw "NSIS installer was not found in $BundleDir"
}

if (-not (Test-Path -LiteralPath $OutputDir)) {
  New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}
foreach ($Path in @($OutputPath, $ManifestPath, $ShaPath)) {
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Force
  }
}
Copy-Item -LiteralPath $Installer.FullName -Destination $OutputPath -Force
$Hash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
$Manifest = [ordered]@{
  product = "NM Image Studio"
  version = $ReleaseVersion
  package = [System.IO.Path]::GetFileName($OutputPath)
  architecture = "x64"
  installer = "nsis"
  webview2 = if ($OfflineWebView2) { "embedded-offline-installer" } else { "download-bootstrapper" }
  size = (Get-Item -LiteralPath $OutputPath).Length
  sha256 = $Hash
}
$Manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8
Set-Content -LiteralPath $ShaPath -Value "$Hash  $([System.IO.Path]::GetFileName($OutputPath))" -Encoding ASCII

Write-Host "Installer created: $OutputPath"
Write-Host "Manifest: $ManifestPath"
Write-Host "SHA256: $ShaPath"
Write-Host "WebView2 mode: $($Manifest.webview2)"
