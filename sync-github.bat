@echo off
title 🔄 Verified GitHub Sync + Puppeteer Refresh
color 0a

:: Force the working directory to the script’s own folder
cd /d "%~dp0"
setlocal
set LOGFILE=%~dp0sync-log.txt

echo ====================================================== > "%LOGFILE%"
echo [%date% %time%] 🚀 Starting verified sync process... >> "%LOGFILE%"
echo ====================================================== >> "%LOGFILE%"
echo ======================================================
echo 🚀 Starting verified sync process...
echo ======================================================

:: Normalize line endings to prevent CRLF warnings
git config core.autocrlf true

echo.
echo 🧹 Step 1: Cleaning Puppeteer + cache...
echo 🧹 Cleaning Puppeteer + cache... >> "%LOGFILE%"
call npm uninstall puppeteer puppeteer-core >> "%LOGFILE%" 2>&1
call rmdir /s /q node_modules >> "%LOGFILE%" 2>&1
call del /f /q package-lock.json >> "%LOGFILE%" 2>&1
call npm cache clean --force >> "%LOGFILE%" 2>&1

echo.
echo 📦 Step 2: Installing full Puppeteer (latest)...
echo 📦 Installing Puppeteer... >> "%LOGFILE%"
call npm install puppeteer@latest --save >> "%LOGFILE%" 2>&1

echo.
echo 🔍 Step 3: Checking Puppeteer version...
call npx puppeteer --version
call npx puppeteer --version >> "%LOGFILE%" 2>&1

echo.
echo 🧾 Step 4: Commit + Push changes to GitHub...
echo 🧾 Running git add + commit + push... >> "%LOGFILE%"
call git add . >> "%LOGFILE%" 2>&1

set MSG=Auto-sync on %date% -- %time%
call git commit -m "%MSG%" >> "%LOGFILE%" 2>&1
call git push origin main >> "%LOGFILE%" 2>&1

echo.
echo ======================================================
echo 🔍 Verifying remote repository state...
echo ======================================================
call git fetch origin main >> "%LOGFILE%" 2>&1
for /f "tokens=*" %%i in ('git rev-parse HEAD') do set LOCAL_HASH=%%i
for /f "tokens=*" %%i in ('git rev-parse origin/main') do set REMOTE_HASH=%%i

if "%LOCAL_HASH%"=="%REMOTE_HASH%" (
    echo ✅ Verified: Local and remote branches are synchronized.
    echo [%date% %time%] ✅ Verified: Local = Remote >> "%LOGFILE%"
) else (
    echo ❌ Mismatch: Local and remote are out of sync.
    echo [%date% %time%] ❌ Mismatch: Local != Remote >> "%LOGFILE%"
)

echo.
echo ======================================================
echo 🏁 Process completed. Check sync-log.txt for details.
echo ======================================================
echo [%date% %time%] ✅ Sync script finished. >> "%LOGFILE%"

pause
