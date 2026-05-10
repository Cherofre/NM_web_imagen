@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=7861"

echo.
echo Starting Image Generate Web Tool...
echo.

where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File ".\start_web.ps1" -Port %PORT%
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File ".\start_web.ps1" -Port %PORT%
)

if errorlevel 1 (
  echo.
  echo Startup failed. Please check the message above.
  pause
)
