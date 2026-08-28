@echo off
setlocal

REM Always run from the folder where this BAT file is located
cd /d "%~dp0"

echo ==========================================
echo Event Horizon - Banner Update
echo ==========================================

echo.
echo [1/4] Scraping Genshin Impact banners...
node scripts/scrapeGenshinBanners.js
if errorlevel 1 goto :error

echo.
echo [2/4] Scraping Honkai Star Rail banners...
node scripts/scrapeStarRailBanners.js
if errorlevel 1 goto :error

echo.
echo [3/4] Scraping Zenless Zone Zero banners...
node scripts/scrapeZZZBanners.js
if errorlevel 1 goto :error

echo.
echo [4/4] Scraping Wuthering Waves banners...
node scripts/scrapeWuwaBanners.js
if errorlevel 1 goto :error

echo.
echo ==========================================
echo All scrapers completed successfully!
echo ==========================================

echo.
echo Pulling latest changes from GitHub...
git pull origin main --no-rebase --no-edit
if errorlevel 1 (
    echo.
    echo Pull failed - conflicts detected. Trying to resolve...
    git checkout --ours src/data/*.js src/data/*.json
    git add src/data/*.js src/data/*.json
    git -c core.editor=true commit -m "Merge remote changes (keeping local banner updates)"
    if errorlevel 1 echo No conflicts to resolve, continuing...
)

echo.
echo Adding changes to Git...
git add -A
if errorlevel 1 goto :error

REM Get current date and time
for /f "delims=" %%A in ('powershell -NoProfile -Command "Get-Date -Format ''yyyy-MM-dd HH:mm''"') do set "DATETIME=%%A"

echo.
echo Creating commit...
git commit -m "chore: update banners - %DATETIME%"

REM No changes to commit is not treated as a fatal error
if errorlevel 1 (
    echo.
    echo No changes to commit, or commit failed.
)

echo.
echo Pushing to GitHub...
git push origin main
if errorlevel 1 (
    echo.
    echo Push failed - remote has changes. Pulling first...
    git pull origin main --no-rebase --no-edit
    if errorlevel 1 (
        echo.
        echo Pull failed - conflicts detected. Trying to resolve...
        git checkout --ours src/data/*.js src/data/*.json
        git add src/data/*.js src/data/*.json
        git -c core.editor=true commit -m "Merge remote changes (keeping local banner updates)"
        if errorlevel 1 echo No conflicts to resolve, continuing...
    )
    echo.
    echo Retrying push...
    git push origin main
    if errorlevel 1 goto :error
)

echo.
echo ==========================================
echo SUCCESS!
echo Banners updated and pushed to GitHub.
echo ==========================================

pause
exit /b 0

:error
echo.
echo ==========================================
echo ERROR!
echo A scraper or Git command failed.
echo Please check the output above for details.
echo ==========================================

pause
exit /b 1
