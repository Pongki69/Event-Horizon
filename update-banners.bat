@echo off
REM update-banners.bat
REM Scrapes all game banners and automatically pushes to GitHub
REM Run this manually every ~3 weeks when banners update

echo ========================================
echo   Banner Update Script
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/5] Scraping Genshin Impact Banners...
echo ----------------------------------------
node scripts/scrapeGenshinBanners.js
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Genshin banner scraping failed
    echo.
) else (
    echo SUCCESS: Genshin banners updated
    echo.
)

echo [2/5] Scraping Honkai Star Rail Banners...
echo ----------------------------------------
node scripts/scrapeStarRailBanners.js
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Star Rail banner scraping failed
    echo.
) else (
    echo SUCCESS: Star Rail banners updated
    echo.
)

echo [3/5] Scraping Zenless Zone Zero Banners...
echo ----------------------------------------
node scripts/scrapeZZZBanners.js
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: ZZZ banner scraping failed
    echo.
) else (
    echo SUCCESS: ZZZ banners updated
    echo.
)

echo [4/5] Scraping Wuthering Waves Banners...
echo ----------------------------------------
node scripts/scrapeWuwaBanners.js
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Wuwa banner scraping failed
    echo.
) else (
    echo SUCCESS: Wuwa banners updated
    echo.
)

echo.
echo [5/5] Committing and pushing to GitHub...
echo ----------------------------------------

REM Check if there are any changes
git diff --quiet
if %ERRORLEVEL% EQU 0 (
    echo No changes detected. Nothing to commit.
    echo.
    pause
    exit /b 0
)

REM Stage all banner-related files
git add src/data/*.js src/data/*.json public/images/

REM Check if there are staged changes
git diff --cached --quiet
if %ERRORLEVEL% EQU 0 (
    echo No banner changes to commit.
    echo.
    pause
    exit /b 0
)

REM Create commit with current date
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c-%%a-%%b)
git commit -m "chore: update banner data - %mydate%"

REM Push to GitHub
echo Pushing to GitHub...
git push origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo   SUCCESS! All banners updated and pushed
    echo ========================================
) else (
    echo.
    echo ========================================
    echo   ERROR: Failed to push to GitHub
    echo   Please check your git configuration
    echo ========================================
)

echo.
pause
