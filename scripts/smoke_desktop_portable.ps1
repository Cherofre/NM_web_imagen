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

# The desktop app only allows one running instance, and a second launch exits silently
# before it ever creates a window. Refuse loudly instead of reporting a bogus failure.
$Running = @(Get-Process -Name "nm-image-studio-desktop" -ErrorAction SilentlyContinue)
if ($Running.Count -gt 0) {
  throw "NM Image Studio is already running (pid $($Running[0].Id)); close it before running the portable smoke."
}

function Get-FreeTcpPort {
  $Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $Listener.Start()
  $Port = ([System.Net.IPEndPoint]$Listener.LocalEndpoint).Port
  $Listener.Stop()
  return $Port
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

  # A hidden window can suppress painting, so let the window show: the whole point is to
  # prove the interface really renders.
  $DebugPort = Get-FreeTcpPort
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$DebugPort"
  $Process = Start-Process -FilePath $Exe -WorkingDirectory $AppDir -PassThru
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

  $Checker = Join-Path $ScriptDir "lib\assert_desktop_ui.mjs"
  if (-not (Test-Path -LiteralPath $Checker -PathType Leaf)) {
    throw "UI assertion helper is missing: $Checker"
  }
  Write-Host "Checking that the desktop window actually renders ..."
  & node $Checker $DebugPort
  if ($LASTEXITCODE -ne 0) {
    throw "Portable desktop UI did not render. The packaged window would show up blank."
  }

  Write-Host "Portable desktop smoke passed (backend started, window rendered)."
  Write-Host "Extracted root: $AppDir"
} finally {
  if ($Process -and -not $Process.HasExited) {
    Stop-Process -Id $Process.Id -Force
    $Process.WaitForExit(5000)
  }
  Get-Process -Name "nm-image-studio-backend" -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
  }
  Remove-Item Env:\WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $SmokeRoot) {
    Remove-Item -LiteralPath $SmokeRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
