@echo off
chcp 65001 >nul
set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%release_one_click.ps1"
if errorlevel 1 (
  echo.
  echo 发布失败，请查看上方错误。
  pause
  exit /b 1
)
echo.
echo 发布完成。
pause
