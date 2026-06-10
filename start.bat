@echo off
echo.
echo === VaultMind - Starting Gateway + Dashboard ===
echo.
echo Open your browser to the URL shown below after startup
echo.
cd /d "%~dp0"
npx tsx packages\cli\src\index.ts gateway start --port 3080
pause
