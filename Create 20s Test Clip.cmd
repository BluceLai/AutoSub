@echo off
setlocal
cd /d "%~dp0"

echo Creating a 20-second AutoSub test clip...
echo.
node scripts\create-test-clip.mjs
echo.
pause
