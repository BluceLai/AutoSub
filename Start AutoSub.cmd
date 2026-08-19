@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Please install Node.js 22 or newer.
  pause
  exit /b 1
)

echo Starting AutoSub with a floating available port...
echo The browser will open automatically after the server starts.
echo.
node src\server.mjs --port=0 --open
echo.
echo AutoSub stopped.
pause
