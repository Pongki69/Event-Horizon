// fandomLogin.js
// Shared utility to log into Fandom before scraping.
// Credentials are read from environment variables (FANDOM_USERNAME, FANDOM_PASSWORD).
// If a .env file exists in the project root, it is loaded automatically.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-load .env from project root if it exists (fallback for local dev)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

/**
 * Log into Fandom using the provided Puppeteer page.
 * After this call the session cookie is set for all subsequent requests on the same browser instance.
 *
 * @param {import('puppeteer').Page} page - An existing Puppeteer page object
 * @returns {Promise<boolean>} true if login succeeded, false otherwise
 */
export async function loginToFandom(page) {
  const username = process.env.FANDOM_USERNAME;
  const password = process.env.FANDOM_PASSWORD;

  if (!username || !password) {
    console.warn('⚠️  FANDOM_USERNAME or FANDOM_PASSWORD not set. Skipping login.');
    console.warn('   Run with: node --env-file=.env scripts/yourScraper.js');
    return false;
  }

  try {
    console.log('🔐 Logging into Fandom...');

    await page.goto('https://www.fandom.com/signin', {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait for the username field
    await page.waitForSelector('#usernameInput', { timeout: 15000 });

    // Fill in credentials
    await page.type('#usernameInput', username, { delay: 50 });
    await page.type('#passwordInput', password, { delay: 50 });

    // Submit the form
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.click('.login-button'),
    ]);

    // Verify login succeeded by checking for a logged-in indicator
    const loggedIn = await page.evaluate(() => {
      // Fandom sets a wgUserName global when logged in
      return typeof window.mw !== 'undefined' && window.mw.config && !!window.mw.config.get('wgUserName');
    });

    if (loggedIn) {
      console.log('✅ Fandom login successful\n');
      return true;
    }

    // Fallback check: look for sign-out link in the DOM
    const hasSignOut = await page.$('a[href*="logout"]');
    if (hasSignOut) {
      console.log('✅ Fandom login successful\n');
      return true;
    }

    console.warn('⚠️  Login may have failed — could not confirm logged-in state. Continuing anyway...\n');
    return false;
  } catch (err) {
    console.error(`❌ Fandom login error: ${err.message}`);
    console.warn('   Continuing without login — some images may be unavailable.\n');
    return false;
  }
}
