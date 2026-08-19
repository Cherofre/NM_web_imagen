param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir ".."))
$Version = (Get-Content -LiteralPath (Join-Path $RepoRoot "VERSION") -Encoding UTF8 -TotalCount 1).Trim()
if ([string]::IsNullOrWhiteSpace($Version)) {
  throw "VERSION is empty."
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $RepoRoot "_release\web\NM_web_imagen-v$Version-Web-x64.zip"
}
$OutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$OutputDir = Split-Path -Parent $OutputPath
$PackageName = [System.IO.Path]::GetFileNameWithoutExtension($OutputPath)
$ManifestPath = Join-Path $OutputDir "$PackageName.manifest.json"
$ShaPath = Join-Path $OutputDir "$PackageName.sha256"

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "package_web_tool.ps1") -OutputPath $OutputPath
if ($LASTEXITCODE -ne 0) {
  throw "Web package build failed with exit code $LASTEXITCODE."
}

$Hash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
$Manifest = [ordered]@{
  product = "NM_web_imagen"
  version = $Version
  package = [System.IO.Path]::GetFileName($OutputPath)
  architecture = "x64"
  mode = "web-portable"
  default_port = 7861
  size = (Get-Item -LiteralPath $OutputPath).Length
  sha256 = $Hash
}
$Manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8
Set-Content -LiteralPath $ShaPath -Value "$Hash  $([System.IO.Path]::GetFileName($OutputPath))" -Encoding ASCII

Write-Host "Web package created: $OutputPath"
Write-Host "Manifest: $ManifestPath"
Write-Host "SHA256: $ShaPath"
