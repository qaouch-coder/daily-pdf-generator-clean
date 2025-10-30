@echo off
title 🔄 Sync GitHub + Fix Puppeteer (Safe Mode)
color 0a

echo ======================================================
echo 🧹 Step 1/4: Cleaning old Puppeteer and cache...
echo ======================================================
call npm uninstall puppeteer puppeteer-core
call rmdir /s /q node_modules
call del /f /q package-lock.json
call npm cache clean --force

echo.
echo ======================================================
echo 📦 Step 2/4: Installing full Puppeteer (latest)...
echo ======================================================
call npm install puppeteer@latest --save

echo.
echo ======================================================
echo 🔍 Step 3/4: Checking Puppeteer version...
echo ======================================================
call npx puppeteer --version

echo.
echo ======================================================
echo 🧾 Step 4/4: Syncing changes to GitHub...
echo ======================================================
call git add .
echo.
call git status -s
echo.
set /p msg="💬 Enter commit message (or press ENTER for default): "
if "%msg%"=="" set msg=Auto-sync (Updated Puppeteer + project changes)
call git commit -m "%msg%"
call git push -u origin main

echo.
echo ======================================================
echo ✅ Done! Everything is synced successfully.
echo ======================================================
pause
