param(
  [ValidateRange(1, 65535)]
  [int]$Port = 7861
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppPath = Join-Path $ScriptDir "app.py"
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

function Test-LocalServer {
  try {
    $Response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 1
    return $Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500
  } catch {
    return $false
  }
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
      Remove-Item -LiteralPath $PortablePythonZip -Force -ErrorAction SilentlyContinue
      Ensure-PortablePythonZip
      Expand-Archive -LiteralPath $PortablePythonZip -DestinationPath $RuntimePythonDir -Force
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

if (Test-LocalServer) {
  Write-Host "Backend service is already running. Opening:"
  Write-Host $OpenUrl
  Start-Process $OpenUrl
  exit 0
}

$Python = Ensure-PortablePython

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

Write-Host "Opening:"
Write-Host $OpenUrl
Write-Host ""
Write-Host "Keep this window open while using the web tool."
Write-Host "To stop the service, close this window, press Ctrl+C, or run stop_web.bat."
Write-Host ""

Start-Process $OpenUrl
Invoke-SelectedPython -Python $Python -Arguments @(".\app.py", "--host", "127.0.0.1", "--port", "$Port")
exit $LASTEXITCODE
