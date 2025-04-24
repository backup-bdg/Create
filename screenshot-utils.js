const fs = require('fs');
const path = require('path');

// Create screenshots directory if it doesn't exist
const ensureScreenshotsDir = () => {
  const dir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

// Take screenshot and save it with timestamp
const captureScreenshot = async (page, name) => {
  try {
    const dir = ensureScreenshotsDir();
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filename = `${name}_${timestamp}.png`;
    const filepath = path.join(dir, filename);
    
    await page.screenshot({ path: filepath, fullPage: true });
    console.log(`Screenshot saved to ${filepath}`);
    return filepath;
  } catch (error) {
    console.error(`Error capturing screenshot: ${error.message}`);
    return null;
  }
};

// Capture HTML content for debugging
const captureHtml = async (page, name) => {
  try {
    const dir = ensureScreenshotsDir();
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filename = `${name}_${timestamp}.html`;
    const filepath = path.join(dir, filename);
    
    const html = await page.content();
    fs.writeFileSync(filepath, html);
    console.log(`HTML content saved to ${filepath}`);
    return filepath;
  } catch (error) {
    console.error(`Error capturing HTML: ${error.message}`);
    return null;
  }
};

// Check for bot detection elements on the page
const checkForBotDetection = async (page) => {
  try {
    const botDetectionIndicators = [
      // Common reCAPTCHA elements
      'iframe[src*="recaptcha"]',
      'iframe[src*="captcha"]',
      // Common text indicators
      'text/Automated access is blocked',
      'text/unusual activity',
      'text/bot detection',
      'text/security check',
      // Common CloudFlare elements
      '#challenge-form',
      '#cf-challenge',
      // hCaptcha elements
      'iframe[src*="hcaptcha"]',
      // Invisible overlay elements
      '.bot-detection',
      '.security-check',
      '.verify-human'
    ];
    
    for (const selector of botDetectionIndicators) {
      if (selector.startsWith('text/')) {
        const text = selector.substring(5);
        const hasText = await page.evaluate((text) => {
          return document.body.innerText.toLowerCase().includes(text.toLowerCase());
        }, text);
        
        if (hasText) {
          console.log(`Bot detection indicator found: Text containing "${text}"`);
          return true;
        }
      } else {
        const hasElement = await page.evaluate((selector) => {
          return document.querySelector(selector) !== null;
        }, selector);
        
        if (hasElement) {
          console.log(`Bot detection indicator found: Element matching "${selector}"`);
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error(`Error checking for bot detection: ${error.message}`);
    return false;
  }
};

// Try multiple selectors until one works
const waitForAnySelector = async (page, selectors, options = {}) => {
  const { timeout = 15000, visible = true } = options;
  const startTime = Date.now();
  
  for (let attempt = 1; Date.now() - startTime < timeout; attempt++) {
    for (const selector of selectors) {
      try {
        // Try to wait for selector with a short timeout
        await page.waitForSelector(selector, {
          visible,
          timeout: Math.min(5000, timeout - (Date.now() - startTime))
        });
        console.log(`Found selector "${selector}" on attempt ${attempt}`);
        return selector; // Return the selector that worked
      } catch (e) {
        // Selector not found, continue to next one
      }
    }
    
    // Wait a bit before trying again
    if (Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // None of the selectors worked within the timeout
  throw new Error(`None of the selectors found within ${timeout}ms: ${selectors.join(', ')}`);
};

module.exports = {
  captureScreenshot,
  captureHtml,
  checkForBotDetection,
  waitForAnySelector
};
