param(
  [ValidateRange(1, 65535)]
  [int]$Port = 7861
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppPath = Join-Path $ScriptDir "app.py"

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

function Test-IsWebToolProcess {
  param([string]$CommandLine)

  if ([string]::IsNullOrWhiteSpace($CommandLine)) {
    return $false
  }

  $NormalizedCommand = $CommandLine.Replace("/", "\")
  $NormalizedAppPath = $AppPath.Replace("/", "\")
  return $NormalizedCommand -like "*app.py*" -and (
    $NormalizedCommand -like "*$NormalizedAppPath*" -or
    $NormalizedCommand -like "*\app.py*" -or
    $NormalizedCommand -like "* app.py*" -or
    $NormalizedCommand -like "*.\\app.py*"
  )
}

Write-Section "Image Generate Web Tool - Stop Service"

$Connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if ($Connections.Count -eq 0) {
  Write-Host "No backend service is listening on port $Port."
  exit 0
}

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
  Write-Host "Stopped backend service PID $ProcessId."
}

if ($Stopped -eq 0 -and $Skipped -gt 0) {
  throw "Port $Port is occupied, but it does not look like this web tool backend. Skipped to avoid stopping another program."
}

Write-Host ""
Write-Host "Done. You can close the browser page."
