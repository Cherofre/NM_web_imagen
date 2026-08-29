param(
  [string]$WebZipPath = "",
  [string]$DesktopZipPath = ""
)

$ErrorActionPreference = "Stop"

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir ".."))
$Version = (Get-Content -LiteralPath (Join-Path $RepoRoot "VERSION") -Encoding UTF8 -TotalCount 1).Trim()
if ([string]::IsNullOrWhiteSpace($WebZipPath)) {
  $WebZipPath = Join-Path $RepoRoot "_release\web\NM_web_imagen-v$Version-Web-x64.zip"
}
if ([string]::IsNullOrWhiteSpace($DesktopZipPath)) {
  $DesktopZipPath = Join-Path $RepoRoot "_release\desktop\NM-Image-Studio-v$Version-Portable-x64.zip"
}
foreach ($Path in @($WebZipPath, $DesktopZipPath)) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Required package was not found: $Path"
  }
}

$SmokeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("nm_image_studio_coexist_" + [guid]::NewGuid().ToString("N"))
$WebExtract = Join-Path $SmokeRoot "web"
$DesktopExtract = Join-Path $SmokeRoot "desktop"
$WebProcess = $null
$DesktopProcess = $null
New-Item -ItemType Directory -Force -Path $WebExtract, $DesktopExtract | Out-Null

try {
  Expand-Archive -LiteralPath $WebZipPath -DestinationPath $WebExtract -Force
  Expand-Archive -LiteralPath $DesktopZipPath -DestinationPath $DesktopExtract -Force
  $WebApp = Join-Path $WebExtract "NM_web_imagen"
  $DesktopApp = Join-Path $DesktopExtract "NM Image Studio"
  $WebEntry = Join-Path $WebApp "app.py"
  $DesktopExe = Join-Path $DesktopApp "nm-image-studio-desktop.exe"
  if (-not (Test-Path -LiteralPath $WebEntry -PathType Leaf)) { throw "Web package entry is missing." }
  if (-not (Test-Path -LiteralPath $DesktopExe -PathType Leaf)) { throw "Desktop package entry is missing." }

  $Listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
  $Listener.Start()
  $WebPort = ([System.Net.IPEndPoint]$Listener.LocalEndpoint).Port
  $Listener.Stop()
  $Python = (Get-Command python.exe -ErrorAction Stop).Source
  $WebStdout = Join-Path $SmokeRoot "web.stdout.log"
  $WebStderr = Join-Path $SmokeRoot "web.stderr.log"
  $WebProcess = Start-Process -FilePath $Python `
    -ArgumentList @($WebEntry, "--host", "127.0.0.1", "--port", "$WebPort") `
    -WorkingDirectory $WebApp `
    -RedirectStandardOutput $WebStdout `
    -RedirectStandardError $WebStderr `
    -WindowStyle Hidden `
    -PassThru

  $HealthUrl = "http://127.0.0.1:$WebPort/api/health"
  $WebHealth = $null
  for ($Attempt = 0; $Attempt -lt 100; $Attempt += 1) {
    if ($WebProcess.HasExited) { throw "Web package process exited during startup." }
    try {
      $WebHealth = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 1
      if ($WebHealth.StatusCode -eq 200) { break }
    } catch {
      $WebHealth = $null
    }
    Start-Sleep -Milliseconds 200
  }
  if ($null -eq $WebHealth -or $WebHealth.StatusCode -ne 200) {
    throw "Web package did not become healthy."
  }

  $DesktopProcess = Start-Process -FilePath $DesktopExe -WorkingDirectory $DesktopApp -WindowStyle Hidden -PassThru
  $DesktopData = Join-Path $DesktopApp "data"
  $DesktopLog = Join-Path $DesktopData "desktop-backend.log"
  $DesktopPort = $null
  for ($Attempt = 0; $Attempt -lt 120; $Attempt += 1) {
    if ($DesktopProcess.HasExited) { throw "Desktop package process exited during startup." }
    if (Test-Path -LiteralPath $DesktopLog -PathType Leaf) {
      $LogText = Get-Content -LiteralPath $DesktopLog -Raw -ErrorAction SilentlyContinue
      if ($LogText -match "127\.0\.0\.1:(\d+)") {
        $DesktopPort = [int]$Matches[1]
        break
      }
    }
    Start-Sleep -Milliseconds 250
  }
  if ($null -eq $DesktopPort) { throw "Desktop backend port was not observed in its isolated log." }
  if ($DesktopPort -eq $WebPort) { throw "Web and desktop unexpectedly selected the same port." }
  if ($WebProcess.HasExited) { throw "Starting the desktop app stopped the web app." }
  $SecondWebHealth = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
  if ($SecondWebHealth.StatusCode -ne 200) { throw "Web app became unhealthy after desktop startup." }
  if (-not (Test-Path -LiteralPath (Join-Path $WebApp "outputs") -PathType Container)) {
    throw "Web package did not keep its own outputs directory."
  }
  if (-not (Test-Path -LiteralPath $DesktopData -PathType Container)) {
    throw "Desktop package did not keep its own data directory."
  }

  $Payload = $SecondWebHealth.Content | ConvertFrom-Json
  Write-Host "Web and desktop coexistence smoke passed."
  Write-Host "Web version: $($Payload.version)"
  Write-Host "Web port: $WebPort"
  Write-Host "Desktop backend port: $DesktopPort"
  Write-Host "Web data root: $(Join-Path $WebApp 'outputs')"
  Write-Host "Desktop data root: $DesktopData"
} finally {
  if ($DesktopProcess -and -not $DesktopProcess.HasExited) {
    Stop-Process -Id $DesktopProcess.Id -Force
    [void]$DesktopProcess.WaitForExit(5000)
  }
  if ($WebProcess -and -not $WebProcess.HasExited) {
    Stop-Process -Id $WebProcess.Id -Force
    [void]$WebProcess.WaitForExit(5000)
  }
  if (Test-Path -LiteralPath $SmokeRoot) {
    Remove-Item -LiteralPath $SmokeRoot -Recurse -Force
  }
}
