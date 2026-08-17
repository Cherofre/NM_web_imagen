param()

$ErrorActionPreference = "Stop"

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir ".."))
$RuntimeRoot = Join-Path $RepoRoot ".runtime"
$SmokeRoot = Join-Path $RuntimeRoot ("desktop-sidecar-smoke-" + [guid]::NewGuid().ToString("N"))
$Binary = Join-Path (Join-Path (Join-Path $RepoRoot "studio-web") "src-tauri") "backend\nm-image-studio-backend.exe"
$Listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
$Listener.Start()
$Port = ([System.Net.IPEndPoint]$Listener.LocalEndpoint).Port
$Listener.Stop()
$HealthUrl = "http://127.0.0.1:$Port/api/health"
$Token = "desktop-smoke-token"

if (-not (Test-Path -LiteralPath $Binary -PathType Leaf)) {
  throw "Desktop backend binary was not found: $Binary"
}

New-Item -ItemType Directory -Force -Path $SmokeRoot | Out-Null
$env:IMAGE_TOOL_DATA_ROOT = $SmokeRoot
$env:IMAGE_TOOL_DESKTOP_TOKEN = $Token
$env:IMAGE_TOOL_DEV_CORS_ORIGINS = "http://tauri.localhost"
$Process = $null

try {
  $Process = Start-Process `
    -FilePath $Binary `
    -ArgumentList @("--host", "127.0.0.1", "--port", "$Port") `
    -PassThru `
    -WindowStyle Hidden

  $Response = $null
  for ($Attempt = 0; $Attempt -lt 120; $Attempt += 1) {
    if ($Process.HasExited) {
      throw "Desktop backend exited before becoming healthy. Exit code: $($Process.ExitCode)"
    }
    try {
      $Response = Invoke-WebRequest `
        -Uri $HealthUrl `
        -Headers @{ "X-NM-Desktop-Token" = $Token; "Origin" = "http://tauri.localhost" } `
        -UseBasicParsing `
        -TimeoutSec 1
      if ($Response.StatusCode -eq 200) {
        break
      }
    } catch {
      $Response = $null
    }
    Start-Sleep -Milliseconds 250
  }

  if ($null -eq $Response -or $Response.StatusCode -ne 200) {
    throw "Desktop backend health check timed out."
  }

  $UnauthorizedStatus = 0
  try {
    Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2 | Out-Null
  } catch {
    if ($_.Exception.Response) {
      $UnauthorizedStatus = [int]$_.Exception.Response.StatusCode
    }
  }
  if ($UnauthorizedStatus -ne 401) {
    throw "Desktop backend accepted a request without its token. Status: $UnauthorizedStatus"
  }

  $Payload = $Response.Content | ConvertFrom-Json
  Write-Host "Desktop backend smoke passed."
  Write-Host "Port: $Port"
  Write-Host "Version: $($Payload.version)"
  Write-Host "Instance: $($Payload.instance_id)"
  Write-Host "Data root: $SmokeRoot"
} finally {
  if ($Process -and -not $Process.HasExited) {
    Stop-Process -Id $Process.Id -Force
  }
  Remove-Item Env:IMAGE_TOOL_DATA_ROOT -ErrorAction SilentlyContinue
  Remove-Item Env:IMAGE_TOOL_DESKTOP_TOKEN -ErrorAction SilentlyContinue
  Remove-Item Env:IMAGE_TOOL_DEV_CORS_ORIGINS -ErrorAction SilentlyContinue
}
