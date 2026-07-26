@echo off
REM ============================================================
REM  TGAutoPoster - stop anything on the dev ports, then start
REM  the API/bot server and the Mini App in two new windows.
REM  Just double-click this file (Windows).
REM ============================================================
setlocal

cd /d "%~dp0"

echo [TGAutoPoster] Stopping anything on ports 8787 and 5173...
for %%P in (8787 5173) do (
  for /f "tokens=5" %%A in ('netstat -aon ^| findstr :%%P ^| findstr LISTENING') do (
    echo   killing PID %%A on port %%P
    taskkill /F /PID %%A >nul 2>&1
  )
)

echo [TGAutoPoster] Installing dependencies (safe to skip if already installed)...
call pnpm install

echo [TGAutoPoster] Starting API + bot  -^>  http://localhost:8787
start "TGAP Server" cmd /k "pnpm dev:server"

echo [TGAutoPoster] Starting Mini App    -^>  http://localhost:5173
start "TGAP MiniApp" cmd /k "pnpm dev:miniapp"

echo.
echo [TGAutoPoster] Started. Open http://localhost:5173 in your browser.
echo Close the two new windows (or run this file again) to restart.
endlocal
