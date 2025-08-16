#!/usr/bin/env node

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');
const BASE_URL = 'http://localhost:3000';

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function takeScreenshots() {
  console.log('🖼️  Starting automated screenshot capture...');
  
  const browser = await puppeteer.launch({
    headless: false, // Show browser for debugging
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  const page = await browser.newPage();
  
  try {
    // 1. Main application interface
    console.log('📸 Capturing main interface...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01-main-interface.png'),
      fullPage: true
    });
    
    // 2. Game import interface (upload tab)
    console.log('📸 Capturing import interface...');
    await page.click('[data-tab="upload"]');
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '02-import-interface.png'),
      fullPage: true
    });
    
    // 3. Position search interface
    console.log('📸 Capturing position search...');
    await page.click('[data-search-tab="position"]');
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '03-position-search.png'),
      fullPage: true
    });
    
    // 4. Position search with pieces placed
    console.log('📸 Setting up position search with pieces...');
    await page.evaluate(() => {
      // Place some pieces on the board for demonstration
      if (window.searchBoard) {
        window.searchBoard.position({
          'd4': 'wP',
          'e4': 'wN',
          'f3': 'wB',
          'g2': 'wR'
        });
      }
    });
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '04-position-with-pieces.png'),
      fullPage: true
    });
    
    // 5. Multi-piece selection modal
    console.log('📸 Capturing multi-piece selection...');
    await page.evaluate(() => {
      // Simulate right-click to open piece selection modal
      const d4Square = document.querySelector('[data-square="d4"]');
      if (d4Square) {
        const event = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        d4Square.dispatchEvent(event);
      }
    });
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '05-piece-selection-modal.png'),
      fullPage: true
    });
    
    // Close modal
    await page.keyboard.press('Escape');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 6. Search results
    console.log('📸 Performing search and capturing results...');
    await page.click('#positionSearchBtn');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for search to complete
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '06-search-results.png'),
      fullPage: true
    });
    
    // 7. Settings modal
    console.log('📸 Capturing settings interface...');
    await page.click('#settingsBtn');
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '07-settings-modal.png'),
      fullPage: true
    });
    
    // Close settings modal
    await page.click('#closeSettings');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 8. Database stats in settings
    console.log('📸 Capturing database statistics...');
    await page.click('#settingsBtn');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Take a focused screenshot of the stats section
    const statsElement = await page.$('.stats-section');
    if (statsElement) {
      await statsElement.screenshot({
        path: path.join(SCREENSHOTS_DIR, '08-database-stats.png')
      });
    }
    
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '09-settings-detailed.png'),
      fullPage: true
    });
    
    console.log('✅ All screenshots captured successfully!');
    console.log(`📁 Screenshots saved to: ${SCREENSHOTS_DIR}`);
    
  } catch (error) {
    console.error('❌ Error taking screenshots:', error);
  } finally {
    await browser.close();
  }
}

// Add package.json script entry helper
function generatePackageScript() {
  const packagePath = path.join(__dirname, '..', 'package.json');
  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    if (!packageJson.scripts) {
      packageJson.scripts = {};
    }
    
    packageJson.scripts.screenshots = 'node scripts/take-screenshots.js';
    
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
    console.log('📦 Added "screenshots" script to package.json');
  } catch (error) {
    console.log('⚠️  Could not update package.json:', error.message);
  }
}

if (require.main === module) {
  takeScreenshots().then(() => {
    generatePackageScript();
    process.exit(0);
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { takeScreenshots };