param(
  [Parameter(Mandatory = $true)]
  [string]$ZipPath
)

$ErrorActionPreference = "Stop"
$AppName = "NM_web_imagen"
$ResolvedZipPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ZipPath)
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("nm_web_imagen_smoke_" + [System.Guid]::NewGuid().ToString("N"))
$ExtractRoot = Join-Path $TempRoot "extract"
$ExtractedAppDir = Join-Path $ExtractRoot $AppName
$BackendProcess = $null

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

function Get-FreeLoopbackPort {
  $Listener = New-Object System.Net.Sockets.TcpListener -ArgumentList @([System.Net.IPAddress]::Loopback, 0)
  try {
    $Listener.Start()
    return ([System.Net.IPEndPoint]$Listener.LocalEndpoint).Port
  } finally {
    $Listener.Stop()
  }
}

if (-not (Test-Path -LiteralPath $ResolvedZipPath -PathType Leaf)) {
  throw "Package ZIP was not found: $ResolvedZipPath"
}

try {
  New-Item -ItemType Directory -Path $ExtractRoot -Force | Out-Null
  Expand-Archive -LiteralPath $ResolvedZipPath -DestinationPath $ExtractRoot -Force
  if (-not (Test-Path -LiteralPath $ExtractedAppDir -PathType Container)) {
    throw "Package did not contain the expected $AppName root folder."
  }

  $StartScript = Join-Path $ExtractedAppDir "start_web.ps1"
  $VersionPath = Join-Path $ExtractedAppDir "VERSION"
  $AppPath = Join-Path $ExtractedAppDir "app.py"
  $RuntimePythonPath = Join-Path $ExtractedAppDir ".runtime\python\python.exe"
  foreach ($RequiredPath in @($StartScript, $VersionPath, $AppPath)) {
    if (-not (Test-Path -LiteralPath $RequiredPath -PathType Leaf)) {
      throw "Extracted package is missing: $RequiredPath"
    }
  }

  $ExpectedVersion = (Get-Content -LiteralPath $VersionPath -Encoding UTF8 -TotalCount 1).Trim()
  if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
    throw "Packaged VERSION is empty."
  }

  $Port = Get-FreeLoopbackPort
  & powershell -NoProfile -ExecutionPolicy Bypass -File $StartScript -Port $Port -PrepareOnly -NoBrowser
  if ($LASTEXITCODE -ne 0) {
    throw "Packaged runtime preparation failed with exit code $LASTEXITCODE."
  }
  if (-not (Test-Path -LiteralPath $RuntimePythonPath -PathType Leaf)) {
    throw "Packaged portable Python was not prepared."
  }

  $StdoutPath = Join-Path $TempRoot "backend.stdout.log"
  $StderrPath = Join-Path $TempRoot "backend.stderr.log"
  $BackendArgs = @(
    "`"$AppPath`"",
    "--host",
    "127.0.0.1",
    "--port",
    "$Port"
  )
  $BackendProcess = Start-Process `
    -FilePath $RuntimePythonPath `
    -ArgumentList $BackendArgs `
    -WorkingDirectory $ExtractedAppDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $StdoutPath `
    -RedirectStandardError $StderrPath `
    -PassThru

  $HealthUrl = "http://127.0.0.1:$Port/api/health"
  $Deadline = [DateTime]::UtcNow.AddSeconds(60)
  $HealthPayload = $null
  while ([DateTime]::UtcNow -lt $Deadline) {
    if ($BackendProcess.HasExited) {
      $Stderr = if (Test-Path -LiteralPath $StderrPath) { Get-Content -LiteralPath $StderrPath -Raw -ErrorAction SilentlyContinue } else { "" }
      throw "Packaged backend exited before health check (exit $($BackendProcess.ExitCode)). $Stderr"
    }

    try {
      $Response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
      if ($Response.StatusCode -ge 200 -and $Response.StatusCode -lt 300) {
        $HealthPayload = $Response.Content | ConvertFrom-Json
        break
      }
    } catch {
    }
    Start-Sleep -Milliseconds 250
  }

  if ($null -eq $HealthPayload) {
    throw "Packaged backend did not become healthy before timeout."
  }
  if ($HealthPayload.version -ne $ExpectedVersion) {
    throw "Packaged backend VERSION mismatch: expected $ExpectedVersion, got $($HealthPayload.version)."
  }
  if ([string]::IsNullOrWhiteSpace([string]$HealthPayload.instance_id)) {
    throw "Packaged backend health response did not include a non-empty instance_id."
  }

  Write-Host "Package smoke passed."
  Write-Host "VERSION: $ExpectedVersion"
  Write-Host "instance_id: $($HealthPayload.instance_id)"
} finally {
  if ($null -ne $BackendProcess -and -not $BackendProcess.HasExited) {
    Stop-Process -Id $BackendProcess.Id -Force -ErrorAction SilentlyContinue
    Wait-Process -Id $BackendProcess.Id -Timeout 10 -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $TempRoot) {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
