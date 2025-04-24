const fs = require('fs');
const path = require('path');
const { setTimeout } = require('timers/promises');

// Create logs directory if it doesn't exist
const ensureLogsDir = () => {
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  return logsDir;
};

// Logging utility
const log = (message, type = 'info') => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
  
  console.log(logMessage);
  
  // Also write to log file
  const logsDir = ensureLogsDir();
  const logFile = path.join(logsDir, `account-creation-${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, logMessage + '\n');
  
  return logMessage;
};

// Retry mechanism for flaky operations
const retry = async (fn, options = {}) => {
  const {
    maxRetries = 3,
    retryDelay = 2000,
    retryMultiplier = 1.5,
    onRetry = null,
    name = 'operation'
  } = options;
  
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log(`Attempt ${attempt}/${maxRetries} for ${name}`);
      return await fn();
    } catch (error) {
      lastError = error;
      const delay = retryDelay * Math.pow(retryMultiplier, attempt - 1);
      
      log(`Attempt ${attempt}/${maxRetries} for ${name} failed: ${error.message}`, 'error');
      
      if (attempt < maxRetries) {
        log(`Retrying in ${delay}ms...`);
        if (onRetry) {
          await onRetry(error, attempt);
        }
        await setTimeout(delay);
      }
    }
  }
  
  throw new Error(`${name} failed after ${maxRetries} attempts: ${lastError.message}`);
};

// Safe browser page interaction
const safeInteraction = async (page, action, options = {}) => {
  const {
    selector = null,
    timeout = 10000,
    waitForNavigation = false,
    navigationOptions = { waitUntil: 'networkidle0' }
  } = options;
  
  try {
    // Wait for selector if provided
    if (selector) {
      await page.waitForSelector(selector, { timeout });
    }
    
    // Execute the action
    const actionPromise = action();
    
    // Wait for navigation if requested
    if (waitForNavigation) {
      await Promise.all([
        actionPromise,
        page.waitForNavigation(navigationOptions)
      ]);
    } else {
      await actionPromise;
    }
    
    return true;
  } catch (error) {
    log(`Safe interaction failed: ${error.message}`, 'error');
    throw error;
  }
};

// Stealth browser setup
const setupStealthBrowser = async (puppeteer) => {
  // Define browser arguments for better stealth and compatibility
  const browserArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-infobars',
    '--window-position=0,0',
    '--ignore-certificate-errors',
    '--ignore-certificate-errors-spki-list',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--hide-scrollbars',
    '--disable-notifications',
    '--disable-extensions',
    '--disable-plugins',
    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
  ];
  
  // Launch browser with stealth settings
  const browser = await puppeteer.launch({
    headless: true,
    args: browserArgs,
    defaultViewport: {
      width: 1920,
      height: 1080
    }
  });
  
  return browser;
};

// Random delays to mimic human behavior
const humanDelay = async () => {
  const minDelay = 500;
  const maxDelay = 2000;
  const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  await setTimeout(delay);
};

// Error categorization
const categorizeError = (error) => {
  const errorMessage = error.message.toLowerCase();
  
  if (errorMessage.includes('captcha')) {
    return {
      type: 'CAPTCHA_ERROR',
      recoverable: true,
      message: 'CAPTCHA solving failed'
    };
  } else if (errorMessage.includes('timeout') || errorMessage.includes('navigation')) {
    return {
      type: 'NAVIGATION_ERROR',
      recoverable: true,
      message: 'Page navigation timed out'
    };
  } else if (errorMessage.includes('selector') || errorMessage.includes('element')) {
    return {
      type: 'ELEMENT_ERROR',
      recoverable: true,
      message: 'Element not found or unavailable'
    };
  } else if (errorMessage.includes('verification') || errorMessage.includes('sms') || errorMessage.includes('phone')) {
    return {
      type: 'VERIFICATION_ERROR',
      recoverable: false,
      message: 'Verification failed'
    };
  } else {
    return {
      type: 'UNKNOWN_ERROR',
      recoverable: false,
      message: error.message
    };
  }
};

module.exports = {
  log,
  retry,
  safeInteraction,
  setupStealthBrowser,
  humanDelay,
  categorizeError
};
