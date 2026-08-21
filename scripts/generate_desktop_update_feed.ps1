param(
  [Parameter(Mandatory = $true)][string]$ReleaseVersion,
  [Parameter(Mandatory = $true)][string]$InstallerUpdaterPath,
  [Parameter(Mandatory = $true)][string]$InstallerSignaturePath,
  [Parameter(Mandatory = $true)][string]$PortablePath,
  [Parameter(Mandatory = $true)][string]$PortableSignaturePath,
  [string]$OutputDirectory = "",
  [string]$ReleaseBaseUrl = "https://github.com/Cherofre/NM_web_imagen/releases/download/v$ReleaseVersion",
  [string]$Notes = ""
)

$ErrorActionPreference = "Stop"
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir ".."))
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path $RepoRoot "_release\desktop\updater"
}
$OutputDirectory = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)

function Resolve-RequiredFile {
  param([string]$Path, [string]$Label)
  $resolved = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
    throw "$Label was not found: $resolved"
  }
  return $resolved
}

function Read-Signature {
  param([string]$Path)
  $value = Get-Content -LiteralPath $Path -Raw -Encoding ASCII
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Signature is empty: $Path"
  }
  return $value.Trim()
}

function Get-AssetName {
  param([string]$Path)
  return [System.IO.Path]::GetFileName((Resolve-RequiredFile $Path "Asset"))
}

$InstallerPathResolved = Resolve-RequiredFile $InstallerUpdaterPath "Installer updater artifact"
$InstallerSignatureResolved = Resolve-RequiredFile $InstallerSignaturePath "Installer signature"
$PortablePathResolved = Resolve-RequiredFile $PortablePath "Portable ZIP"
$PortableSignatureResolved = Resolve-RequiredFile $PortableSignaturePath "Portable signature"
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$InstallerName = Get-AssetName $InstallerPathResolved
$PortableName = Get-AssetName $PortablePathResolved
$InstallerHash = (Get-FileHash -LiteralPath $InstallerPathResolved -Algorithm SHA256).Hash.ToLowerInvariant()
$PortableHash = (Get-FileHash -LiteralPath $PortablePathResolved -Algorithm SHA256).Hash.ToLowerInvariant()
$InstallerSignature = Read-Signature $InstallerSignatureResolved
$PortableSignature = Read-Signature $PortableSignatureResolved
$BaseUrl = $ReleaseBaseUrl.TrimEnd("/")

$Latest = [ordered]@{
  version = $ReleaseVersion
  notes = $Notes
  pub_date = (Get-Date).ToUniversalTime().ToString("o")
  releasePage = "https://github.com/Cherofre/NM_web_imagen/releases/tag/v$ReleaseVersion"
  package = $InstallerName
  sha256 = $InstallerHash
  size = (Get-Item -LiteralPath $InstallerPathResolved).Length
  platforms = [ordered]@{
    "windows-x86_64" = [ordered]@{
      signature = $InstallerSignature
      url = "$BaseUrl/$InstallerName"
    }
  }
}

$Portable = [ordered]@{
  version = $ReleaseVersion
  notes = $Notes
  pub_date = $Latest.pub_date
  releasePage = $Latest.releasePage
  package = $PortableName
  sha256 = $PortableHash
  size = (Get-Item -LiteralPath $PortablePathResolved).Length
  mode = "desktop-portable"
  platforms = [ordered]@{
    "windows-x86_64" = [ordered]@{
      signature = $PortableSignature
      url = "$BaseUrl/$PortableName"
    }
  }
}

$LatestPath = Join-Path $OutputDirectory "latest.json"
$PortableFeedPath = Join-Path $OutputDirectory "portable-latest.json"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($LatestPath, ($Latest | ConvertTo-Json -Depth 8), $Utf8NoBom)
[System.IO.File]::WriteAllText($PortableFeedPath, ($Portable | ConvertTo-Json -Depth 8), $Utf8NoBom)

Write-Host "Generated: $LatestPath"
Write-Host "Generated: $PortableFeedPath"
Write-Host "Installer SHA256: $InstallerHash"
Write-Host "Portable SHA256: $PortableHash"
