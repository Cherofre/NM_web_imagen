param(
  [Parameter(Mandatory = $true)][string]$DestinationRoot,
  [string]$ReleaseVersion = "",
  [switch]$Preview
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [Console]::OutputEncoding
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
. (Join-Path $PSScriptRoot "release_validation.ps1")
$ReleaseVersion = Get-ValidatedReleaseVersion -RepoRoot $RepoRoot -ExpectedVersion $ReleaseVersion
$AllowedRoot = 'G:\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具'
$ResolvedRoot = [IO.Path]::GetFullPath($DestinationRoot).TrimEnd('\', '/')
if (-not $ResolvedRoot.Equals([IO.Path]::GetFullPath($AllowedRoot).TrimEnd('\', '/'), [StringComparison]::OrdinalIgnoreCase)) {
  throw "Destination does not match the approved share layout: $ResolvedRoot"
}
$Desktop = [IO.Path]::GetFullPath((Join-Path $ResolvedRoot 'NM Image Studio Desktop'))
if (-not $Desktop.StartsWith($ResolvedRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $Desktop -PathType Container)) {
  throw "Existing desktop distribution directory is required: $Desktop"
}
if (((Get-Item -LiteralPath $Desktop).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw "Refusing a redirected desktop distribution directory"
}

# Validate every source before changing the share. Hashes stay in the release
# artifacts, not beside the user-facing packages in G:.
$Packages = @(
  @('Setup-x64.exe', '安装版.exe'),
  @('Offline-WebView2-Setup-x64.exe', '离线安装版.exe'),
  @('Portable-x64.zip', '便携版.zip')
)
$Plan = @(foreach ($Pair in $Packages) {
  $Stem = "NM-Image-Studio-v$ReleaseVersion-$($Pair[0])"
  $Source = Join-Path $RepoRoot ("_release\desktop\" + $Stem)
  $Manifest = [IO.Path]::ChangeExtension($Source, '.manifest.json')
  if (-not (Test-Path -LiteralPath $Source -PathType Leaf) -or -not (Test-Path -LiteralPath $Manifest -PathType Leaf)) {
    throw "Required release package or manifest is missing: $Source"
  }
  $Metadata = Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json
  $Hash = (Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Metadata.version -ne $ReleaseVersion -or $Metadata.sha256 -ne $Hash) {
    throw "Release package version/hash verification failed: $Stem"
  }
  [pscustomobject]@{ Source = $Source; Destination = Join-Path $Desktop ("NM Image Studio $ReleaseVersion " + $Pair[1]); Hash = $Hash }
})
$Older = @(Get-ChildItem -LiteralPath $Desktop -File | Where-Object {
  if ($_.Name -match '^NM Image Studio (\d+\.\d+\.\d+) (安装版\.exe|离线安装版\.exe|便携版\.zip)(\.sha256)?$') {
    $FoundVersion = [version]$Matches[1]
    if ($FoundVersion -gt [version]$ReleaseVersion) { throw 'Share contains a newer desktop version; refusing downgrade' }
    $FoundVersion -lt [version]$ReleaseVersion
  } else { $false }
})
foreach ($Item in $Plan) { Write-Output "Sync: $($Item.Destination)" }
foreach ($Item in $Older) { Write-Output "Archive outside G: $($Item.Name)" }
if ($Preview) { return }

$Backup = Join-Path $RepoRoot ('_release\share-backups\' + [guid]::NewGuid().ToString('N'))
foreach ($Item in $Plan) {
  if (Test-Path -LiteralPath $Item.Destination -PathType Leaf) {
    if ((Get-FileHash -LiteralPath $Item.Destination -Algorithm SHA256).Hash.ToLowerInvariant() -eq $Item.Hash) { continue }
    New-Item -ItemType Directory -Path $Backup -Force | Out-Null
    Copy-Item -LiteralPath $Item.Destination -Destination $Backup
  }
  Copy-Item -LiteralPath $Item.Source -Destination $Item.Destination -Force
  if ((Get-FileHash -LiteralPath $Item.Destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Item.Hash) {
    throw 'Copied desktop package hash differs; old packages have not been removed'
  }
}
# Only rotate recognized older desktop package files after all new copies pass.
# No recursive delete/move, unpacked app, .sha256 creation, or directory mirror.
foreach ($Item in $Older) {
  New-Item -ItemType Directory -Path $Backup -Force | Out-Null
  Move-Item -LiteralPath $Item.FullName -Destination $Backup
}
$Instructions = Join-Path $Desktop '说明-如何选择版本.txt'
if (Test-Path -LiteralPath $Instructions -PathType Leaf) {
  $Text = Get-Content -LiteralPath $Instructions -Raw -Encoding UTF8
  $Updated = $Text -replace '(?m)^NM Image Studio Desktop v\d+\.\d+\.\d+', "NM Image Studio Desktop v$ReleaseVersion"
  if ($Updated -ne $Text) { [IO.File]::WriteAllText($Instructions, $Updated, [Text.UTF8Encoding]::new($false)) }
}
Write-Output "Desktop share synchronized without expanding packages or adding checksum files."
