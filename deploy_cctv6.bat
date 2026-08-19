@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

echo ================================================
echo  CCTV Phase 6 - Deploy Script
echo ================================================

:: Step 1: Extract zip
echo.
echo [1/5] ZIP extract করা হচ্ছে...
powershell -NoProfile -Command "Expand-Archive -Path 'E:\cctv-phase6.zip' -DestinationPath 'E:\madrasah-website' -Force"
if %errorlevel% neq 0 (
    echo [ERROR] ZIP extract ব্যর্থ হয়েছে।
    exit /b 1
)
echo [OK] Extract সম্পন্ন।

:: Step 2: npm install - root
echo.
echo [2/5] npm install - root...
cd /d E:\madrasah-website
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Root npm install ব্যর্থ।
    exit /b 1
)
echo [OK] Root npm install সম্পন্ন।

:: npm install - client
echo.
echo [3/5] npm install - client...
cd /d E:\madrasah-website\client
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Client npm install ব্যর্থ।
    exit /b 1
)
echo [OK] Client npm install সম্পন্ন।

:: npm install - server
cd /d E:\madrasah-website\server
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Server npm install ব্যর্থ।
    exit /b 1
)
echo [OK] Server npm install সম্পন্ন।

:: Step 3: npm run check
echo.
echo [4/5] npm run check চালানো হচ্ছে...
cd /d E:\madrasah-website
call npm run check
if %errorlevel% neq 0 (
    echo [ERROR] Check ব্যর্থ। Push করা হবে না।
    exit /b 1
)
echo [OK] Check পাস হয়েছে।

:: Step 4: git add, commit, push
echo.
echo [5/5] Git commit এবং push...
cd /d E:\madrasah-website
git add client/src/types/index.ts client/src/lib/api.ts client/src/lib/permissions.ts client/src/modules/Cameras.tsx client/src/App.tsx client/src/components/Sidebar.tsx client/src/i18n/bn.ts client/src/i18n/en.ts docs/CURRENT_TASK.md
if %errorlevel% neq 0 (
    echo [ERROR] git add ব্যর্থ।
    exit /b 1
)

git commit -m "feat(cctv): Phase 6 — Cameras management UI (bridge + camera CRUD)"
if %errorlevel% neq 0 (
    echo [ERROR] git commit ব্যর্থ।
    exit /b 1
)

git push
if %errorlevel% neq 0 (
    echo [ERROR] git push ব্যর্থ।
    exit /b 1
)

echo.
echo ================================================
echo  সব ধাপ সফল! Phase 6 deploy সম্পন্ন।
echo ================================================
exit /b 0
