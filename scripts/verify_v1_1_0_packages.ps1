param()

$ErrorActionPreference = "Stop"

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir ".."))
$Version = (Get-Content -LiteralPath (Join-Path $RepoRoot "VERSION") -Encoding UTF8 -TotalCount 1).Trim()
$TauriConfig = (Get-Content -LiteralPath (Join-Path $RepoRoot "studio-web\src-tauri\tauri.conf.json") -Raw -Encoding UTF8) | ConvertFrom-Json
$CargoText = Get-Content -LiteralPath (Join-Path $RepoRoot "studio-web\src-tauri\Cargo.toml") -Raw -Encoding UTF8
if ($CargoText -notmatch '(?m)^version\s*=\s*"([^"]+)"') {
  throw "Cargo package version was not found."
}
$CargoVersion = $Matches[1]
if ($Version -ne "1.1.1" -or $TauriConfig.version -ne $Version -or $CargoVersion -ne $Version) {
  throw "Release versions are not synchronized: VERSION=$Version, Tauri=$($TauriConfig.version), Cargo=$CargoVersion"
}

$Packages = @(
  [ordered]@{ path = "_release\desktop\NM-Image-Studio-v$Version-Setup-x64.exe"; webview2 = "download-bootstrapper" },
  [ordered]@{ path = "_release\desktop\NM-Image-Studio-v$Version-Offline-WebView2-Setup-x64.exe"; webview2 = "embedded-offline-installer" },
  [ordered]@{ path = "_release\desktop\NM-Image-Studio-v$Version-Portable-x64.zip"; mode = "desktop-portable" },
  [ordered]@{ path = "_release\web\NM_web_imagen-v$Version-Web-x64.zip"; mode = "web-portable" }
)

foreach ($Package in $Packages) {
  $FullPath = Join-Path $RepoRoot $Package.path
  if (-not (Test-Path -LiteralPath $FullPath -PathType Leaf)) {
    throw "Release package is missing: $FullPath"
  }
  $BaseName = [System.IO.Path]::GetFileNameWithoutExtension($FullPath)
  $Directory = Split-Path -Parent $FullPath
  $ManifestPath = Join-Path $Directory "$BaseName.manifest.json"
  $ShaPath = Join-Path $Directory "$BaseName.sha256"
  if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) { throw "Manifest is missing: $ManifestPath" }
  if (-not (Test-Path -LiteralPath $ShaPath -PathType Leaf)) { throw "SHA256 file is missing: $ShaPath" }
  $Manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($Manifest.version -ne $Version) { throw "Manifest version mismatch: $ManifestPath" }
  if ($Package.Contains("mode") -and $Manifest.mode -ne $Package.mode) { throw "Manifest mode mismatch: $ManifestPath" }
  if ($Package.Contains("webview2") -and $Manifest.webview2 -ne $Package.webview2) { throw "WebView2 mode mismatch: $ManifestPath" }
  $ActualHash = (Get-FileHash -LiteralPath $FullPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Manifest.sha256 -ne $ActualHash) { throw "Manifest hash mismatch: $FullPath" }
  $ShaText = (Get-Content -LiteralPath $ShaPath -Encoding ASCII -TotalCount 1).Trim()
  if (-not $ShaText.StartsWith($ActualHash, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "SHA256 sidecar mismatch: $ShaPath"
  }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$PortableZipPath = Join-Path $RepoRoot "_release\desktop\NM-Image-Studio-v$Version-Portable-x64.zip"
$PortableZip = [System.IO.Compression.ZipFile]::OpenRead($PortableZipPath)
try {
  $PortableNames = @($PortableZip.Entries | ForEach-Object { $_.FullName -replace "\\", "/" })
  foreach ($Required in @(
    "NM Image Studio/nm-image-studio-desktop.exe",
    "NM Image Studio/backend/nm-image-studio-backend.exe",
    "NM Image Studio/portable.mode"
  )) {
    if ($PortableNames -cnotcontains $Required) { throw "Portable package is missing: $Required" }
  }
  if (($PortableNames -match '^NM Image Studio/data/').Count -gt 0) { throw "Portable package contains local data." }
} finally {
  $PortableZip.Dispose()
}

$WebZipPath = Join-Path $RepoRoot "_release\web\NM_web_imagen-v$Version-Web-x64.zip"
$WebZip = [System.IO.Compression.ZipFile]::OpenRead($WebZipPath)
try {
  $WebNames = @($WebZip.Entries | ForEach-Object { $_.FullName -replace "\\", "/" })
  foreach ($Forbidden in @(
    "NM_web_imagen/config.local.json",
    "NM_web_imagen/portable.mode",
    "NM_web_imagen/nm-image-studio-desktop.exe"
  )) {
    if ($WebNames -ccontains $Forbidden) { throw "Web package contains desktop or local-only content: $Forbidden" }
  }
  $VersionEntry = $WebZip.Entries | Where-Object { ($_.FullName -replace "\\", "/") -eq "NM_web_imagen/VERSION" } | Select-Object -First 1
  if ($null -eq $VersionEntry) { throw "Web package VERSION is missing." }
  $Reader = New-Object System.IO.StreamReader($VersionEntry.Open())
  try {
    if ($Reader.ReadToEnd().Trim() -ne $Version) { throw "Web package VERSION is not $Version." }
  } finally {
    $Reader.Dispose()
  }
} finally {
  $WebZip.Dispose()
}

Write-Host "v$Version package verification passed."
Write-Host "Normal Setup, offline WebView2 Setup, portable desktop and portable web artifacts are version-aligned and isolated."
