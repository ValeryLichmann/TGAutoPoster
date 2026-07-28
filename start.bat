@echo off
rem ============================================================
rem  TGAutoPoster — start / restart everything (Windows)
rem  Double-click this file, or run it from a terminal.
rem  - stops anything already running on ports 8787 / 5173
rem  - installs dependencies on first run
rem  - opens two windows: API+scheduler+bot, and the Mini App
rem ============================================================
setlocal
cd /d "%~dp0"
title TGAutoPoster launcher

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [!] pnpm is not installed. Run:  npm install -g pnpm
  pause
  exit /b 1
)

echo [1/4] Stopping any previous instances...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8787" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>nul

if not exist node_modules (
  echo [2/4] First run - installing dependencies ^(takes a minute^)...
  call pnpm install
  if errorlevel 1 (
    echo [!] pnpm install failed.
    pause
    exit /b 1
  )
) else (
  echo [2/4] Dependencies already installed.
)

echo [3/4] Starting API + scheduler + bot ^(port 8787^)...
start "TGAutoPoster - server" cmd /k "cd /d "%~dp0" && pnpm dev:server"

echo [4/4] Starting Mini App ^(port 5173^)...
start "TGAutoPoster - miniapp" cmd /k "cd /d "%~dp0" && pnpm dev:miniapp"

rem Give vite a moment, then open the browser
timeout /t 5 /nobreak >nul
start http://localhost:5173

echo.
echo Done. Two windows are now running:
echo   - "TGAutoPoster - server"   http://localhost:8787  (close it to stop)
echo   - "TGAutoPoster - miniapp"  http://localhost:5173
echo Run this file again any time to restart both.
echo.
pause
