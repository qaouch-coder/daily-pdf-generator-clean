@echo off
title 🧠 GitHub Sync - Daily WordSearch Project
echo.
echo ===============================================
echo   WordSearchToPrint.com GitHub Sync Utility
echo   Directory: %cd%
echo ===============================================
echo.

REM Abort any half-finished merges or rebases safely
git merge --abort >nul 2>&1
git rebase --abort >nul 2>&1

REM Fetch latest remote updates
echo 🌀 Fetching latest changes from GitHub...
git fetch origin main

REM Rebase local changes cleanly
echo 🔄 Rebasing local commits...
git pull --rebase origin main

REM Stage all changed files
echo 📦 Staging changes...
git add .

REM Commit with timestamped message
setlocal enabledelayedexpansion
for /f "tokens=1-3 delims=/: " %%a in ("%date%") do (
  set TODAY=%%a-%%b-%%c
)
git commit -m "Auto-sync on !TODAY!"

REM Push everything to GitHub
echo 🚀 Pushing to origin/main...
git push -u origin main

echo.
echo ✅ All changes synced successfully!
pause
