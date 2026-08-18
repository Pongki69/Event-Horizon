# Event Horizon

A web application that tracks current and upcoming events, banners, and endgame content for popular gacha games:
- Genshin Impact
- Honkai: Star Rail
- Zenless Zone Zero
- Wuthering Waves

## 🚀 Features

- Real-time event tracking
- Current and upcoming banner schedules
- Endgame content timelines
- Automated data updates via GitHub Actions
- Clean, responsive UI built with React + Vite

## 📦 Installation

```bash
npm install
```

## 🛠️ Development

```bash
npm run dev
```

## 📊 Data Scraping

### Automated (GitHub Actions) ✅

Event data is automatically scraped every 12 hours via GitHub Actions using the Fandom wiki APIs:

- **Genshin Impact Events**: `scripts/scrapeGenshinCurrentUpcoming.js`
- **Honkai: Star Rail Events & Endgame**: `scripts/scrapeStarRailCurrentUpcoming.js` & `scripts/scrapeStarRailEndgame.js`
- **Zenless Zone Zero Events**: `scripts/scrapeZZZCurrentUpcoming.js`
- **Wuthering Waves Events**: `scripts/scrapeWuwaCurrentUpcoming.js`

### Manual (Local Run Required) ⚠️

Banner data requires manual local scraping because Game8.co blocks datacenter IPs (including GitHub Actions runners via AWS WAF).

**Easy Way (Recommended):**
Run the automated script every ~3 weeks per patch:
- Double-click **`update-banners.bat`** or **`update-banners.ps1`**
- Script runs all 4 game scrapers, commits, and pushes automatically

**Manual Way:**
```bash
# Run individual scrapers
node scripts/scrapeGenshinBanners.js
node scripts/scrapeStarRailBanners.js
node scripts/scrapeZZZBanners.js
node scripts/scrapeWuwaBanners.js

# Commit and push
git add src/data/*.json public/images/
git commit -m "chore: update banner data"
git push
```

### Why Manual Scraping for Banners?

Game8.co (primary source for upcoming banner leaks) uses AWS WAF to block datacenter IP ranges, including all GitHub Actions runners. The block happens at the infrastructure level and cannot be bypassed with code changes. Local residential IPs are not affected.

## 🗂️ Project Structure

```
├── src/
│   └── data/          # Game data (events, banners)
├── scripts/           # Web scraping scripts
├── public/
│   └── images/        # Scraped banner images
├── .github/
│   └── workflows/     # GitHub Actions (automated event scraping)
```

## 🔧 Tech Stack

- **Frontend**: React + Vite
- **Scraping**: Puppeteer (banners) + fetch (events via MediaWiki API)
- **Automation**: GitHub Actions (events only)
- **Styling**: CSS

## 📝 License

MIT
