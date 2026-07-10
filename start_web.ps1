param(
  [ValidateRange(1, 65535)]
  [int]$Port = 7861,
  [switch]$PrepareOnly,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppPath = Join-Path $ScriptDir "app.py"
$ResolvedAppPath = [System.IO.Path]::GetFullPath($AppPath)
$VersionPath = Join-Path $ScriptDir "VERSION"
$RequirementsPath = Join-Path $ScriptDir "requirements.txt"
$VenvDir = Join-Path $ScriptDir ".venv"
$VenvPythonPath = Join-Path $VenvDir "Scripts\python.exe"
$WheelDir = Join-Path $ScriptDir "vendor\wheels"
$PortablePythonZip = Join-Path $ScriptDir "vendor\python\python-3.12.10-embed-amd64.zip"
$RuntimeDir = Join-Path $ScriptDir ".runtime"
$RuntimePythonDir = Join-Path $RuntimeDir "python"
$RuntimeSitePackages = Join-Path $RuntimeDir "site-packages"
$RuntimePythonPath = Join-Path $RuntimePythonDir "python.exe"
$RuntimeFingerprintPath = Join-Path $RuntimeDir "runtime.fingerprint"
$Url = "http://127.0.0.1:$Port"
$AppVersion = "0.0.0"
if (Test-Path -LiteralPath $VersionPath) {
  $AppVersion = (Get-Content -LiteralPath $VersionPath -Encoding UTF8 -TotalCount 1).Trim()
  if ([string]::IsNullOrWhiteSpace($AppVersion)) {
    $AppVersion = "0.0.0"
  }
}
$OpenUrl = "$Url/?v=$([System.Uri]::EscapeDataString($AppVersion))"
$HealthUrl = "$Url/api/health"
$DiagnosticsUrl = "$Url/api/diagnostics"

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

function Write-Section {
  param([string]$Text)

  Write-Host ""
  Write-Host "================================"
  Write-Host $Text
  Write-Host "================================"
  Write-Host ""
}

function Get-InstanceId {
  param(
    [string]$RootPath = $ScriptDir,
    [hashtable]$Python = $null
  )

  if ($null -eq $Python) {
    if ([string]::IsNullOrWhiteSpace($RuntimePythonPath)) {
      throw "Portable Python is required to compute the backend instance ID."
    }
    $Python = @{ Command = $RuntimePythonPath; Args = @() }
  }

  $Code = 'import hashlib, pathlib, sys; normalized = str(pathlib.Path(sys.argv[1]).resolve()).replace(chr(47), chr(92)).rstrip(chr(92)).casefold(); print(hashlib.sha256(normalized.encode()).hexdigest()[:20])'
  $Output = @(Invoke-SelectedPython -Python $Python -Arguments @("-c", $Code, $RootPath) 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to compute the backend instance ID with portable Python: $($Output -join [Environment]::NewLine)"
  }

  $Value = ([string]($Output | Select-Object -Last 1)).Trim()
  if ($Value -notmatch "^[0-9a-f]{20}$") {
    throw "Portable Python returned an invalid backend instance ID: $Value"
  }
  return $Value
}

function Test-LocalServer {
  try {
    $Response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 1
    return $Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Test-BackendVersion {
  try {
    $Response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 1
    if ($Response.StatusCode -lt 200 -or $Response.StatusCode -ge 500) {
      return $false
    }

    $HealthPayload = $Response.Content | ConvertFrom-Json
    return $HealthPayload.version -eq $AppVersion -and
      $HealthPayload.instance_id -eq $InstanceId
  } catch {
    return $false
  }
}

function Resolve-StudioAssetUrl {
  param([string]$Reference)

  if ([string]::IsNullOrWhiteSpace($Reference)) {
    return $null
  }

  try {
    $BaseUri = New-Object System.Uri -ArgumentList $OpenUrl
    $ResolvedUri = New-Object System.Uri -ArgumentList @($BaseUri, $Reference)
    return $ResolvedUri.AbsoluteUri
  } catch {
    return $null
  }
}

function Test-StudioAssets {
  try {
    $NoCacheHeaders = @{
      "Cache-Control" = "no-cache"
      "Pragma" = "no-cache"
    }
    $Response = Invoke-WebRequest -Uri $OpenUrl -UseBasicParsing -TimeoutSec 2 -Headers $NoCacheHeaders
    if ($Response.StatusCode -lt 200 -or $Response.StatusCode -ge 400) {
      return $false
    }

    $AssetPattern = '(?:src|href)=["'']([^"'']*assets/[^"'']+\.(?:js|css))["'']'
    $AssetMatches = [regex]::Matches([string]$Response.Content, $AssetPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($AssetMatches.Count -eq 0) {
      return $false
    }

    foreach ($AssetMatch in $AssetMatches) {
      $AssetUrl = Resolve-StudioAssetUrl -Reference $AssetMatch.Groups[1].Value
      if ([string]::IsNullOrWhiteSpace($AssetUrl)) {
        return $false
      }

      $AssetResponse = Invoke-WebRequest -Uri $AssetUrl -UseBasicParsing -TimeoutSec 2 -Headers $NoCacheHeaders
      if ($AssetResponse.StatusCode -lt 200 -or $AssetResponse.StatusCode -ge 400) {
        return $false
      }
    }

    return $true
  } catch {
    return $false
  }
}

function Test-RequiredApiRoutes {
  try {
    $Payload = @{
      "engine" = "gpt-image-2"
      "api_key" = ""
      "base_url" = "https://example.com/v1"
      "chat_model" = "gpt-5.5"
      "checks" = @("chat")
    } | ConvertTo-Json -Depth 4
    $Response = Invoke-WebRequest -Uri $DiagnosticsUrl -Method Post -ContentType "application/json" -Body $Payload -UseBasicParsing -TimeoutSec 2
    return $Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Test-IsWebToolProcess {
  param([string]$CommandLine)

  if ([string]::IsNullOrWhiteSpace($CommandLine)) {
    return $false
  }

  $NormalizedCommand = $CommandLine.Replace("/", "\")
  $NormalizedAppPath = $ResolvedAppPath.Replace("/", "\")
  return $NormalizedCommand -like "*$NormalizedAppPath*"
}

function Stop-ExistingWebToolProcesses {
  $Connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  $Stopped = 0
  $Skipped = 0
  $ProcessIds = @($Connections | Select-Object -ExpandProperty OwningProcess -Unique)

  foreach ($ProcessId in $ProcessIds) {
    $Process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if ($null -eq $Process) {
      continue
    }

    if (-not (Test-IsWebToolProcess -CommandLine $Process.CommandLine)) {
      $Skipped += 1
      Write-Host "Skipped non-tool process PID $ProcessId`: $($Process.Name)"
      continue
    }

    Stop-Process -Id $ProcessId -Force
    $Stopped += 1
    Write-Host "Stopped stale backend service PID $ProcessId."
  }

  if ($Stopped -eq 0 -and $Skipped -gt 0) {
    throw "Port $Port is occupied, but it does not look like this web tool backend. Skipped to avoid stopping another program."
  }

  return $Stopped
}

function Remove-ChildDirectory {
  param(
    [string]$Path,
    [string]$Name
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  $ResolvedScriptDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ScriptDir)
  $ResolvedPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
  if (-not $ResolvedPath.StartsWith($ResolvedScriptDir, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove unexpected $Name path: $ResolvedPath"
  }

  Remove-Item -LiteralPath $ResolvedPath -Recurse -Force
}

function Find-Python {
  $Candidates = @(
    @{ Command = "python"; Args = @() },
    @{ Command = "py"; Args = @("-3.13") },
    @{ Command = "py"; Args = @("-3.12") },
    @{ Command = "py"; Args = @("-3.11") },
    @{ Command = "py"; Args = @("-3.10") },
    @{ Command = "py"; Args = @("-3") }
  )

  foreach ($Candidate in $Candidates) {
    try {
      & $Candidate.Command @($Candidate.Args + @("--version")) >$null 2>$null
      if ($LASTEXITCODE -ne 0) {
        continue
      }

      & $Candidate.Command @($Candidate.Args + @("-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)")) >$null 2>$null
      if ($LASTEXITCODE -eq 0) {
        return $Candidate
      }
    } catch {
    }
  }

  return $null
}

function Invoke-SelectedPython {
  param(
    [hashtable]$Python,
    [string[]]$Arguments
  )

  $PreviousErrorActionPreference = $ErrorActionPreference
  try {
    # Windows PowerShell can turn native stderr into a terminating error when
    # ErrorActionPreference is Stop. Python tracebacks should be handled by
    # exit code here so dependency auto-install can still run.
    $ErrorActionPreference = "Continue"
    & $Python.Command @($Python.Args + $Arguments)
  } finally {
    $ErrorActionPreference = $PreviousErrorActionPreference
  }
}

function Test-PythonDependencies {
  param([hashtable]$Python)

  Invoke-SelectedPython -Python $Python -Arguments @("-c", "import fastapi, uvicorn, requests; from app import app") >$null 2>$null
  return $LASTEXITCODE -eq 0
}

function Show-PythonDependencyError {
  param([hashtable]$Python)

  Write-Host "Dependency verification failed. Detailed Python error:"
  Invoke-SelectedPython -Python $Python -Arguments @("-c", "import fastapi, uvicorn, requests; from app import app")
}

function Ensure-LocalVenv {
  param([hashtable]$BasePython)

  if (Test-Path -LiteralPath $VenvPythonPath) {
    return
  }

  Write-Host "Creating local virtual environment: .venv"
  Invoke-SelectedPython -Python $BasePython -Arguments @("-m", "venv", $VenvDir)
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $VenvPythonPath)) {
    throw "Failed to create local .venv. Please make sure Python includes the venv module."
  }
}

function Remove-LocalVenv {
  Write-Host "Recreating local virtual environment because verification failed..."
  Remove-ChildDirectory -Path $VenvDir -Name ".venv"
}

function Configure-PortablePythonPath {
  $PthFile = Get-ChildItem -LiteralPath $RuntimePythonDir -Filter "python*._pth" -File -ErrorAction SilentlyContinue | Select-Object -First 1
  $StdlibZip = Get-ChildItem -LiteralPath $RuntimePythonDir -Filter "python*.zip" -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $PthFile -or $null -eq $StdlibZip) {
    throw "Portable Python runtime is incomplete."
  }

  $PthContent = @(
    $StdlibZip.Name,
    ".",
    "..\..",
    "..\site-packages",
    "import site"
  )
  Set-Content -LiteralPath $PthFile.FullName -Value $PthContent -Encoding ASCII
}

function Test-PortablePythonZip {
  return Test-Path -LiteralPath $PortablePythonZip
}

function Ensure-PortablePythonZip {
  if (Test-PortablePythonZip) {
    return
  }

  throw "Bundled Python is missing: vendor\python\python-3.12.10-embed-amd64.zip. Please use the complete NM_web_imagen.zip package."
}

function Get-RuntimeFingerprint {
  if (-not (Test-Path -LiteralPath $PortablePythonZip)) {
    throw "Bundled Python ZIP was not found while computing the runtime fingerprint."
  }
  if (-not (Test-Path -LiteralPath $RequirementsPath)) {
    throw "requirements.txt was not found while computing the runtime fingerprint."
  }
  if (-not (Test-Path -LiteralPath $WheelDir)) {
    throw "Bundled wheels were not found while computing the runtime fingerprint."
  }

  $GetFileSha256 = {
    param([string]$Path)

    $FileStream = [System.IO.File]::OpenRead($Path)
    $FileSha = [System.Security.Cryptography.SHA256]::Create()
    try {
      $FileHash = $FileSha.ComputeHash($FileStream)
      return ([BitConverter]::ToString($FileHash)).Replace("-", "").ToLowerInvariant()
    } finally {
      $FileSha.Dispose()
      $FileStream.Dispose()
    }
  }

  $Parts = @(
    "python:$(& $GetFileSha256 $PortablePythonZip)",
    "requirements:$(& $GetFileSha256 $RequirementsPath)"
  )
  $WheelFiles = @(Get-ChildItem -LiteralPath $WheelDir -Filter "*.whl" -File | Sort-Object Name)
  foreach ($Wheel in $WheelFiles) {
    $WheelHash = & $GetFileSha256 $Wheel.FullName
    $Parts += "wheel:$($Wheel.Name):$WheelHash"
  }

  $Sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $Payload = $Parts -join "`n"
    $Hash = $Sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Payload))
    return ([BitConverter]::ToString($Hash)).Replace("-", "").ToLowerInvariant()
  } finally {
    $Sha.Dispose()
  }
}

function Ensure-PortablePython {
  param([switch]$Rebuild)

  if ($Rebuild) {
    Write-Host "Recreating bundled portable Python runtime..."
    Remove-ChildDirectory -Path $RuntimeDir -Name ".runtime"
  }

  if (-not (Test-Path -LiteralPath $RuntimePythonPath)) {
    Ensure-PortablePythonZip

    Write-Host "System Python was not found. Preparing bundled portable Python..."
    New-Item -ItemType Directory -Path $RuntimePythonDir -Force | Out-Null
    try {
      Expand-Archive -LiteralPath $PortablePythonZip -DestinationPath $RuntimePythonDir -Force
    } catch {
      Remove-ChildDirectory -Path $RuntimeDir -Name "incomplete .runtime"
      throw "Failed to extract bundled portable Python. The vendor ZIP was preserved; please verify the package and try again."
    }
    Configure-PortablePythonPath
  } else {
    Configure-PortablePythonPath
  }

  New-Item -ItemType Directory -Path $RuntimeSitePackages -Force | Out-Null
  return @{ Command = $RuntimePythonPath; Args = @(); Portable = $true }
}

function Install-PortableDependencies {
  param([hashtable]$Python)

  if (-not (Test-Path -LiteralPath $WheelDir)) {
    throw "Bundled wheels were not found. Please use the full NM_web_imagen.zip package."
  }

  $WheelFiles = @(Get-ChildItem -LiteralPath $WheelDir -Filter "*.whl" -File -ErrorAction SilentlyContinue)
  $CompatibleWheels = @($WheelFiles | Where-Object {
    $_.Name -match "-py3-none-any\.whl$" -or
    $_.Name -match "-py2\.py3-none-any\.whl$" -or
    $_.Name -match "-cp312-cp312-win_amd64\.whl$"
  })

  if ($CompatibleWheels.Count -eq 0) {
    throw "No compatible bundled wheels were found for portable Python 3.12."
  }

  Write-Host "Installing dependencies into portable runtime..."
  Remove-ChildDirectory -Path $RuntimeSitePackages -Name ".runtime site-packages"
  New-Item -ItemType Directory -Path $RuntimeSitePackages -Force | Out-Null

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  foreach ($Wheel in $CompatibleWheels) {
    [System.IO.Compression.ZipFile]::ExtractToDirectory($Wheel.FullName, $RuntimeSitePackages)
  }
}

function Ensure-Pip {
  param([hashtable]$Python)

  Invoke-SelectedPython -Python $Python -Arguments @("-m", "pip", "--version") >$null 2>$null
  if ($LASTEXITCODE -eq 0) {
    return
  }

  Write-Host "pip was not found in .venv. Trying ensurepip..."
  Invoke-SelectedPython -Python $Python -Arguments @("-m", "ensurepip", "--upgrade")
  if ($LASTEXITCODE -ne 0) {
    throw "pip is not available in local .venv. Please reinstall Python with pip enabled."
  }
}

function Install-Dependencies {
  param([hashtable]$Python)

  Ensure-Pip -Python $Python

  $WheelFiles = @()
  if (Test-Path -LiteralPath $WheelDir) {
    $WheelFiles = @(Get-ChildItem -LiteralPath $WheelDir -Filter "*.whl" -File -ErrorAction SilentlyContinue)
  }

  if ($WheelFiles.Count -gt 0) {
    Write-Host "Installing dependencies from bundled wheels..."
    Invoke-SelectedPython -Python $Python -Arguments @("-m", "pip", "install", "--no-index", "--find-links", $WheelDir, "-r", $RequirementsPath)
    if ($LASTEXITCODE -eq 0) {
      return
    }

    Write-Host "Bundled wheel install failed. Trying online pip install..."
  } else {
    Write-Host "No bundled wheels found. Installing dependencies online..."
  }

  Invoke-SelectedPython -Python $Python -Arguments @("-m", "pip", "install", "-r", $RequirementsPath)
  if ($LASTEXITCODE -ne 0) {
    throw "Dependency installation failed. Please check your network, Python, or bundled wheels."
  }
}

Write-Section "Image Generate Web Tool - Start"
Write-Host "Version: $AppVersion"

Set-Location -LiteralPath $ScriptDir

if (-not (Test-Path -LiteralPath $AppPath)) {
  throw "app.py was not found. Please make sure this script is inside the web tool folder."
}

if (-not (Test-Path -LiteralPath $RequirementsPath)) {
  throw "requirements.txt was not found. Dependencies cannot be checked."
}

$ExpectedRuntimeFingerprint = Get-RuntimeFingerprint
$StoredRuntimeFingerprint = ""
if (Test-Path -LiteralPath $RuntimeFingerprintPath) {
  $StoredRuntimeFingerprint = (Get-Content -LiteralPath $RuntimeFingerprintPath -Encoding ASCII -TotalCount 1).Trim()
}
$RuntimeFingerprintMatches = (
  $StoredRuntimeFingerprint -eq $ExpectedRuntimeFingerprint -and
  (Test-Path -LiteralPath $RuntimePythonPath -PathType Leaf)
)

$LocalServerRunning = $false
if (-not $PrepareOnly) {
  $LocalServerRunning = Test-LocalServer
  if ($LocalServerRunning -and -not $RuntimeFingerprintMatches) {
    Write-Host "Backend service is running, but bundled runtime inputs changed."
    Write-Host "Restarting current web tool service before rebuilding the portable runtime..."
    $Stopped = Stop-ExistingWebToolProcesses
    if ($Stopped -eq 0) {
      throw "Could not restart the existing backend service. Please run stop_web.bat, then start again."
    }
    Start-Sleep -Milliseconds 800
    if (Test-LocalServer) {
      throw "Port $Port is still occupied after restart attempt. Please run stop_web.bat, then start again."
    }
    $LocalServerRunning = $false
  }
}

if (-not $RuntimeFingerprintMatches) {
  Write-Host "Bundled runtime inputs changed. Rebuilding portable runtime..."
  Remove-ChildDirectory -Path $RuntimeDir -Name ".runtime"
}

$Python = Ensure-PortablePython
$InstanceId = Get-InstanceId -RootPath $ScriptDir -Python $Python

if (-not $PrepareOnly -and $LocalServerRunning) {
  if ($RuntimeFingerprintMatches -and (Test-BackendVersion) -and (Test-StudioAssets) -and (Test-RequiredApiRoutes)) {
    Write-Host "Backend service is already running. Opening:"
    Write-Host $OpenUrl
    if (-not $NoBrowser) {
      Start-Process $OpenUrl
    }
    exit 0
  }

  Write-Host "Backend service responded, but current version, instance, Studio assets, or API routes did not match."
  Write-Host "Restarting current web tool service..."
  $Stopped = Stop-ExistingWebToolProcesses
  if ($Stopped -eq 0) {
    throw "Could not restart the existing backend service. Please run stop_web.bat, then start again."
  }
  Start-Sleep -Milliseconds 800
  if (Test-LocalServer) {
    throw "Port $Port is still occupied after restart attempt. Please run stop_web.bat, then start again."
  }
}

if (-not (Test-PythonDependencies -Python $Python)) {
  Install-PortableDependencies -Python $Python
}

if (-not (Test-PythonDependencies -Python $Python)) {
  $Python = Ensure-PortablePython -Rebuild
  Install-PortableDependencies -Python $Python
}

if (-not (Test-PythonDependencies -Python $Python)) {
  Show-PythonDependencyError -Python $Python
  throw "Bundled runtime setup failed. Please make sure vendor\wheels is complete and extract the complete NM_web_imagen.zip package again."
}

Set-Content -LiteralPath $RuntimeFingerprintPath -Value $ExpectedRuntimeFingerprint -Encoding ASCII

if ($PrepareOnly) {
  Write-Host "Portable runtime is ready."
  Write-Host "Runtime fingerprint: $ExpectedRuntimeFingerprint"
  exit 0
}

Write-Host "Opening:"
Write-Host $OpenUrl
Write-Host ""
Write-Host "Keep this window open while using the web tool."
Write-Host "To stop the service, close this window, press Ctrl+C, or run stop_web.bat."
Write-Host ""

if (-not $NoBrowser) {
  Start-Process $OpenUrl
}
Invoke-SelectedPython -Python $Python -Arguments @($ResolvedAppPath, "--host", "127.0.0.1", "--port", "$Port")
exit $LASTEXITCODE
