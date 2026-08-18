param(
  [string]$ZipPath = ""
)

$ErrorActionPreference = "Stop"

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir ".."))
if ([string]::IsNullOrWhiteSpace($ZipPath)) {
  $ZipPath = Get-ChildItem -LiteralPath (Join-Path $RepoRoot "_release\desktop") -Filter "*-Portable-x64.zip" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}
if ([string]::IsNullOrWhiteSpace($ZipPath) -or -not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) {
  throw "Portable ZIP was not found. Pass -ZipPath explicitly."
}

$SmokeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("nm_image_studio_portable_smoke_" + [guid]::NewGuid().ToString("N"))
$Process = $null
New-Item -ItemType Directory -Force -Path $SmokeRoot | Out-Null

try {
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $SmokeRoot -Force
  $AppDir = Join-Path $SmokeRoot "NM Image Studio"
  $Exe = Join-Path $AppDir "nm-image-studio-desktop.exe"
  $Backend = Join-Path $AppDir "backend\nm-image-studio-backend.exe"
  $Marker = Join-Path $AppDir "portable.mode"
  if (-not (Test-Path -LiteralPath $Exe -PathType Leaf)) { throw "Portable EXE is missing." }
  if (-not (Test-Path -LiteralPath $Backend -PathType Leaf)) { throw "Portable backend is missing." }
  if (-not (Test-Path -LiteralPath $Marker -PathType Leaf)) { throw "Portable marker is missing." }

  $Process = Start-Process -FilePath $Exe -WorkingDirectory $AppDir -PassThru -WindowStyle Hidden
  $DataRoot = Join-Path $AppDir "data"
  $Ready = $false
  for ($Attempt = 0; $Attempt -lt 80; $Attempt += 1) {
    if ($Process.HasExited) {
      throw "Portable desktop process exited during startup. Exit code: $($Process.ExitCode)"
    }
    if (Test-Path -LiteralPath $DataRoot -PathType Container) {
      $Ready = $true
      break
    }
    Start-Sleep -Milliseconds 250
  }
  if (-not $Ready) {
    throw "Portable data directory was not created during startup."
  }
  Write-Host "Portable desktop smoke passed."
  Write-Host "Extracted root: $AppDir"
} finally {
  if ($Process -and -not $Process.HasExited) {
    Stop-Process -Id $Process.Id -Force
    $Process.WaitForExit(5000)
  }
  if (Test-Path -LiteralPath $SmokeRoot) {
    Remove-Item -LiteralPath $SmokeRoot -Recurse -Force
  }
}
