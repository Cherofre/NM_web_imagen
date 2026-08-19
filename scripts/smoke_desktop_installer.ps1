param(
  [string]$InstallerPath = ""
)

$ErrorActionPreference = "Stop"

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir ".."))
if ([string]::IsNullOrWhiteSpace($InstallerPath)) {
  $InstallerPath = Join-Path $RepoRoot "_release\desktop\NM-Image-Studio-v1.1.0-Setup-x64.exe"
}
if (-not (Test-Path -LiteralPath $InstallerPath -PathType Leaf)) {
  throw "Installer was not found: $InstallerPath"
}

$Existing = Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -eq "NM Image Studio" }
if ($Existing) {
  throw "NM Image Studio is already installed for the current user; refusing to disturb the existing installation."
}

$InstallRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("NMImageStudioInstallSmoke_" + [guid]::NewGuid().ToString("N"))
$InstallerProcess = $null
$UninstallerProcess = $null

try {
  $InstallerProcess = Start-Process -FilePath $InstallerPath -ArgumentList @("/S", "/D=$InstallRoot") -PassThru -WindowStyle Hidden
  $InstallerProcess.WaitForExit()
  if ($InstallerProcess.ExitCode -ne 0) {
    throw "Silent installer exited with code $($InstallerProcess.ExitCode)."
  }

  $InstalledApp = Get-ChildItem -LiteralPath $InstallRoot -Filter "*.exe" -File -ErrorAction Stop |
    Where-Object { $_.Name -notmatch '^uninstall' } |
    Select-Object -First 1
  $Backend = Get-ChildItem -LiteralPath $InstallRoot -Filter "nm-image-studio-backend.exe" -File -Recurse -ErrorAction Stop |
    Select-Object -First 1
  $Uninstaller = Get-ChildItem -LiteralPath $InstallRoot -Filter "uninstall.exe" -File -Recurse -ErrorAction Stop |
    Select-Object -First 1
  if ($null -eq $InstalledApp) { throw "Installed desktop EXE is missing." }
  if ($null -eq $Backend) { throw "Installed backend resource is missing." }
  if ($null -eq $Uninstaller) { throw "Installed uninstaller is missing." }

  Write-Host "Desktop installer extraction smoke passed."
  Write-Host "Installed EXE: $($InstalledApp.FullName)"
  Write-Host "Installed backend: $($Backend.FullName)"

  $UninstallerProcess = Start-Process -FilePath $Uninstaller.FullName -ArgumentList @("/S") -PassThru -WindowStyle Hidden
  $UninstallerProcess.WaitForExit()
  if ($UninstallerProcess.ExitCode -ne 0) {
    throw "Silent uninstaller exited with code $($UninstallerProcess.ExitCode)."
  }
  Start-Sleep -Milliseconds 500
} finally {
  if ($InstallerProcess -and -not $InstallerProcess.HasExited) { Stop-Process -Id $InstallerProcess.Id -Force }
  if ($UninstallerProcess -and -not $UninstallerProcess.HasExited) { Stop-Process -Id $UninstallerProcess.Id -Force }
  if (Test-Path -LiteralPath $InstallRoot) {
    $Removed = $false
    for ($Attempt = 0; $Attempt -lt 12; $Attempt += 1) {
      try {
        Remove-Item -LiteralPath $InstallRoot -Recurse -Force -ErrorAction Stop
        $Removed = $true
        break
      } catch {
        Start-Sleep -Milliseconds 500
      }
    }
    if (-not $Removed -and (Test-Path -LiteralPath $InstallRoot)) {
      Write-Warning "Installer smoke passed, but Windows kept a temporary file locked: $InstallRoot"
    }
  }
}
