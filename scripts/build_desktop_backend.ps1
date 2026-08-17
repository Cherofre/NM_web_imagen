param()

$ErrorActionPreference = "Stop"

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir ".."))
$TauriRoot = Join-Path (Join-Path $RepoRoot "studio-web") "src-tauri"
$BackendDir = Join-Path $TauriRoot "backend"
$StaticDir = Join-Path $RepoRoot "static"
$VersionPath = Join-Path $RepoRoot "VERSION"
$WorkRoot = Join-Path (Join-Path $RepoRoot ".runtime") "desktop-spike-pyinstaller"
$SpecDir = Join-Path $WorkRoot "spec"
$BuildDir = Join-Path $WorkRoot "build"
$DistDir = Join-Path $WorkRoot "dist"
$BuiltBackendDir = Join-Path $DistDir "nm-image-studio-backend"
New-Item -ItemType Directory -Force -Path $SpecDir, $BuildDir, $DistDir | Out-Null

Push-Location $RepoRoot
try {
  & pyinstaller `
    --noconfirm `
    --onedir `
    --contents-directory . `
    --console `
    --name "nm-image-studio-backend" `
    --distpath $DistDir `
    --workpath $BuildDir `
    --specpath $SpecDir `
    --paths $RepoRoot `
    --add-data "$StaticDir;static" `
    --add-data "$VersionPath;." `
    --hidden-import uvicorn.logging `
    --hidden-import uvicorn.loops.auto `
    --hidden-import uvicorn.protocols.http.auto `
    --hidden-import uvicorn.protocols.websockets.auto `
    --hidden-import uvicorn.lifespan.on `
    app.py
  if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller desktop backend build failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

$BuiltBinary = Join-Path $BuiltBackendDir "nm-image-studio-backend.exe"
if (-not (Test-Path -LiteralPath $BuiltBinary -PathType Leaf)) {
  throw "Desktop backend binary was not created: $BuiltBinary"
}

$ResolvedTauriRoot = [System.IO.Path]::GetFullPath($TauriRoot).TrimEnd('\')
$ResolvedBackendDir = [System.IO.Path]::GetFullPath($BackendDir)
if (-not $ResolvedBackendDir.StartsWith("$ResolvedTauriRoot\", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to replace a backend directory outside src-tauri: $ResolvedBackendDir"
}
if (Test-Path -LiteralPath $BackendDir) {
  Remove-Item -LiteralPath $BackendDir -Recurse -Force
}
Copy-Item -LiteralPath $BuiltBackendDir -Destination $BackendDir -Recurse

$ExpectedBinary = Join-Path $BackendDir "nm-image-studio-backend.exe"
if (-not (Test-Path -LiteralPath $ExpectedBinary -PathType Leaf)) {
  throw "Desktop backend binary was not copied: $ExpectedBinary"
}

Write-Host "Desktop backend ready: $ExpectedBinary"
