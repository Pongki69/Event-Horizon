# Manual Banner Scraping Guide

## Why Manual?

Game8.co blocks datacenter IPs (including GitHub Actions) via AWS WAF. Banner data must be scraped from your local machine using your residential IP.

## When to Update

Update banner data every **~3 weeks** when a new patch releases or banner schedule changes.

## How to Update

### 1. Run the Scripts

**Easy Way (Recommended):**
- Double-click **`update-banners.bat`** or **`update-banners.ps1`** in the project root
- The script will automatically:
  - Run all 4 game banner scrapers
  - Commit changes
  - Push to GitHub

**Manual Way:**
```bash
# Genshin Impact
node scripts/scrapeGenshinBanners.js

# Honkai: Star Rail
node scripts/scrapeStarRailBanners.js

# Zenless Zone Zero
node scripts/scrapeZZZBanners.js

# Wuthering Waves
node scripts/scrapeWuwaBanners.js
```

### 2. Commit and Push (Manual Way Only)

```bash
git add src/data/*.json public/images/
git commit -m "chore: update banner data for [patch version]"
git push
```

## Troubleshooting

### Script Fails with 403 Error

- **Cause**: You might be on a VPN or network that Game8 blocks
- **Solution**: Disable VPN and use your home/residential internet

### Images Not Downloading

- **Cause**: Network timeout or Fandom wiki down
- **Solution**: Re-run the script after a few minutes

### Old Banner Data Still Showing

- **Cause**: Browser cache
- **Solution**: Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

## Script Details

Each banner scraper:
1. **Uses Puppeteer** to access Game8.co banner pages
2. **Scrapes banner names and dates** from the HTML
3. **Fetches character images** from Fandom wikis (via API)
4. **Saves data** to `src/data/` as JSON
5. **Downloads images** to `public/images/[game]/banners/`

## Data Files

| Game | Data File | Images |
|------|-----------|--------|
| Genshin Impact | `src/data/genshinBanners.json` | `public/images/genshin-impact/banners/` |
| Honkai: Star Rail | `src/data/hsrBanners.json` | `public/images/honkai-star-rail/banners/` |
| Zenless Zone Zero | `src/data/zzzBanners.json` | `public/images/zenless-zone-zero/banners/` |
| Wuthering Waves | `src/data/wuwaBanners.json` | `public/images/wuthering-waves/banners/` |

## Notes

- **Events are still automated** - Only banners need manual updates
- Scripts work perfectly locally - no code issues
- Takes ~30-60 seconds per game to scrape
- Make sure Node.js and npm packages are installed first
