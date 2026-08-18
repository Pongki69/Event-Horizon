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

    // Try to navigate to login page with multiple strategies
    await page.goto('https://www.fandom.com/signin', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    // Wait a bit for any dynamic content to load
    await new Promise(r => setTimeout(r, 2000));

    // Try multiple possible selectors for the username field
    const usernameSelectors = [
      '#usernameInput',
      'input[name="username"]',
      'input[type="text"]',
      'input[placeholder*="sername"]'
    ];

    let usernameInput = null;
    for (const selector of usernameSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        usernameInput = selector;
        console.log(`Found username input: ${selector}`);
        break;
      } catch (e) {
        continue;
      }
    }

    if (!usernameInput) {
      throw new Error('Could not find username input field');
    }

    // Try multiple possible selectors for the password field
    const passwordSelectors = [
      '#passwordInput',
      'input[name="password"]',
      'input[type="password"]',
      'input[placeholder*="assword"]'
    ];

    let passwordInput = null;
    for (const selector of passwordSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        passwordInput = selector;
        console.log(`Found password input: ${selector}`);
        break;
      } catch (e) {
        continue;
      }
    }

    if (!passwordInput) {
      throw new Error('Could not find password input field');
    }

    // Fill in credentials
    await page.type(usernameInput, username, { delay: 50 });
    await page.type(passwordInput, password, { delay: 50 });

    // Try multiple possible selectors for the login button
    const buttonSelectors = [
      '.login-button',
      'button[type="submit"]',
      'button:has-text("Sign In")',
      'input[type="submit"]'
    ];

    let loginButton = null;
    for (const selector of buttonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          loginButton = selector;
          console.log(`Found login button: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!loginButton) {
      // Try submitting the form directly
      console.log('Trying to submit form directly...');
      await page.evaluate(() => {
        const forms = document.querySelectorAll('form');
        if (forms.length > 0) {
          forms[0].submit();
        }
      });
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
    } else {
      // Click the button and wait for navigation
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
        page.click(loginButton),
      ]);
    }

    // Wait a bit for login to complete
    await new Promise(r => setTimeout(r, 2000));

    // Verify login succeeded by checking for a logged-in indicator
    const loggedIn = await page.evaluate(() => {
      // Check multiple indicators
      if (typeof window.mw !== 'undefined' && window.mw.config && window.mw.config.get('wgUserName')) {
        return true;
      }
      // Check for logout link
      const logoutLink = document.querySelector('a[href*="logout"], a[href*="signout"]');
      if (logoutLink) {
        return true;
      }
      // Check for user menu/profile
      const userMenu = document.querySelector('.wds-global-navigation__user-menu, [data-testid="user-menu"]');
      if (userMenu) {
        return true;
      }
      return false;
    });

    if (loggedIn) {
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
