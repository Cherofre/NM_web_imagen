@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=7861"

echo.
echo Stopping Image Generate Web Tool...
echo.

where pwsh >nul 2>nul
if not errorlevel 1 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File ".\stop_web.ps1" -Port %PORT%
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File ".\stop_web.ps1" -Port %PORT%
)

if errorlevel 1 (
  echo.
  echo Stop failed. Please check the message above.
)
pause
