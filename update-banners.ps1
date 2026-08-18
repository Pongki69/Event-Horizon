# update-banners.ps1
# Scrapes all game banners and automatically pushes to GitHub
# Run this manually every ~3 weeks when banners update

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Banner Update Script" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Check if Node.js is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

$games = @(
    @{Name="Genshin Impact"; Script="scripts/scrapeGenshinBanners.js"},
    @{Name="Honkai Star Rail"; Script="scripts/scrapeStarRailBanners.js"},
    @{Name="Zenless Zone Zero"; Script="scripts/scrapeZZZBanners.js"},
    @{Name="Wuthering Waves"; Script="scripts/scrapeWuwaBanners.js"}
)

$success = 0
$failed = 0

for ($i = 0; $i -lt $games.Count; $i++) {
    $game = $games[$i]
    $num = $i + 1
    
    Write-Host "[$num/$($games.Count)] Scraping $($game.Name) Banners..." -ForegroundColor Yellow
    Write-Host "----------------------------------------" -ForegroundColor Gray
    
    $result = & node $game.Script
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "SUCCESS: $($game.Name) banners updated`n" -ForegroundColor Green
        $success++
    } else {
        Write-Host "WARNING: $($game.Name) banner scraping failed`n" -ForegroundColor Red
        $failed++
    }
}

Write-Host "`n[5/5] Committing and pushing to GitHub..." -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray

# Check if there are any changes
$status = git status --porcelain
if (-not $status) {
    Write-Host "No changes detected. Nothing to commit.`n" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 0
}

# Stage all banner-related files
git add src/data/*.js src/data/*.json public/images/

# Check if there are staged changes
$stagedChanges = git diff --cached --name-only
if (-not $stagedChanges) {
    Write-Host "No banner changes to commit.`n" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 0
}

# Show what will be committed
Write-Host "`nFiles to be committed:" -ForegroundColor Cyan
$stagedChanges | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
Write-Host ""

# Create commit with current date
$date = Get-Date -Format "yyyy-MM-dd"
git commit -m "chore: update banner data - $date"

# Push to GitHub
Write-Host "Pushing to GitHub..." -ForegroundColor Cyan
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "  SUCCESS! All banners updated" -ForegroundColor Green
    Write-Host "  $success succeeded, $failed failed" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "`n========================================" -ForegroundColor Red
    Write-Host "  ERROR: Failed to push to GitHub" -ForegroundColor Red
    Write-Host "  Please check your git configuration" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to exit"
