@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ======================================
echo   TaoKeJi local server starting...
echo   Open browser: http://localhost:8080/
echo   Press Ctrl+C to stop
echo ======================================
echo.

where node >nul 2>nul
if %errorlevel%==0 (
  start "TaoKeJi Server" /min node server.cjs
  echo [OK] Node server started. Opening browser...
  timeout /t 2 /nobreak >nul
  start "" http://localhost:8080/
  exit /b 0
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "TaoKeJi Server" /min python -m http.server 8080
  echo [OK] Python server started. Opening browser...
  timeout /t 2 /nobreak >nul
  start "" http://localhost:8080/
  exit /b 0
)

echo [FAIL] No node or python found. Install Node.js from https://nodejs.org/
pause