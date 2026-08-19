@echo off
setlocal
cd /d "%~dp0"

echo Creating a 10-second AutoSub audio sample...
echo.
node scripts\create-test-clip.mjs --duration=10 --audio-only
echo.
pause
