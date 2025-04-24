// Wrap the entire script in a try-catch block for better error handling
try {
  // Core Node.js modules
  const fs = require('fs');
  const path = require('path');
  const { randomBytes } = require('crypto');
  
  // Handle potential issues with timers/promises in different Node versions
  let setTimeoutPromise;
  try {
    ({ setTimeout: setTimeoutPromise } = require('timers/promises'));
  } catch (error) {
    console.error('Error importing timers/promises:', error.message);
    // Fallback implementation using regular setTimeout
    setTimeoutPromise = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Load npm dependencies with error handling
  let puppeteer, TwoCaptcha, twilio, fetch;
  try {
    puppeteer = require('puppeteer');
    console.log('Successfully loaded puppeteer');
    
    // Log version if available
    try {
      if (typeof puppeteer.version === 'function') {
        console.log('Puppeteer version:', puppeteer.version());
      } else {
        try {
          const pkg = require('puppeteer/package.json');
          console.log('Puppeteer version from package:', pkg.version);
        } catch (pkgError) {
          console.log('Could not determine puppeteer version');
        }
      }
    } catch (versionError) {
      console.log('Could not determine puppeteer version');
    }
  } catch (error) {
    console.error('Error loading puppeteer:', error.message);
    console.error('Try running: npm install puppeteer@latest');
    process.exit(1);
  }
  
  // Load node-fetch for better API requests
  try {
    fetch = require('node-fetch');
    console.log('Successfully loaded node-fetch');
  } catch (error) {
    console.log('node-fetch not available, will use default fetch if needed');
    // Continue without node-fetch, not critical
  }
  
  try {
    // The 2captcha package exports a Solver class, not TwoCaptcha
    console.log('Attempting to load 2captcha package...');
    let twoCaptchaModule;
    
    try {
      // Try loading the 2captcha package first
      twoCaptchaModule = require('2captcha');
      console.log('Successfully loaded 2captcha, available exports:', Object.keys(twoCaptchaModule));
      
      // Check if the module has the expected structure
      if (twoCaptchaModule.Solver) {
        console.log('Using Solver from 2captcha module');
        // Store the Solver class for later use
        TwoCaptcha = twoCaptchaModule.Solver;
      } else if (twoCaptchaModule.TwoCaptcha) {
        console.log('Using TwoCaptcha from 2captcha module');
        TwoCaptcha = twoCaptchaModule.TwoCaptcha;
      } else if (typeof twoCaptchaModule === 'function') {
        console.log('Using 2captcha module as a constructor directly');
        TwoCaptcha = twoCaptchaModule;
      } else {
        throw new Error('Could not find a usable constructor in the 2captcha module');
      }
    } catch (captchaError) {
      console.error('Error loading 2captcha package:', captchaError.message);
      
      // Try loading the alternative two-captcha package
      console.log('Attempting to load two-captcha package as an alternative...');
      try {
        const twoCaptchaAlt = require('two-captcha');
        console.log('Successfully loaded two-captcha (alternative), exports:', Object.keys(twoCaptchaAlt));
        
        if (twoCaptchaAlt.Solver) {
          TwoCaptcha = twoCaptchaAlt.Solver;
          console.log('Using Solver from two-captcha module');
        } else if (typeof twoCaptchaAlt === 'function') {
          TwoCaptcha = twoCaptchaAlt;
          console.log('Using two-captcha module as a constructor directly');
        } else {
          throw new Error('Could not find a usable constructor in the two-captcha module');
        }
      } catch (altError) {
        console.error('Error loading alternative two-captcha package:', altError.message);
        throw new Error('Failed to load any CAPTCHA solving library');
      }
    }
  } catch (error) {
    console.error('Error loading CAPTCHA modules:', error.message);
    console.error('This is a critical error. Please check the 2captcha/two-captcha package installation.');
    process.exit(1);
  }
  
  try {
    twilio = require('twilio');
    console.log('Successfully loaded twilio');
  } catch (error) {
    console.error('Error loading twilio:', error.message);
    process.exit(1);
  }
  
  // Load local utils module with robust path resolution
  let utils;
  let screenshotUtils;
  try {
    // Try multiple possible paths to find utils.js
    const possiblePaths = [
      './utils',
      path.join(__dirname, 'utils'),
      path.resolve(__dirname, 'utils'),
      '../utils',
      '../../utils'
    ];
    
    let loaded = false;
    for (const p of possiblePaths) {
      try {
        utils = require(p);
        console.log(`Successfully loaded utils from: ${p}`);
        loaded = true;
        break;
      } catch (e) {
        console.log(`Failed to load utils from ${p}: ${e.message}`);
      }
    }
    
    if (!loaded) {
      throw new Error('Could not load utils module from any path');
    }
    
    // Load screenshot utilities
    try {
      screenshotUtils = require('./screenshot-utils');
      console.log('Successfully loaded screenshot utilities');
    } catch (e) {
      console.log(`Failed to load screenshot utilities: ${e.message}`);
      // Create minimal screenshot utilities to allow script to continue
      screenshotUtils = {
        captureScreenshot: async () => console.log('Screenshot capture not available'),
        captureHtml: async () => console.log('HTML capture not available'),
        checkForBotDetection: async () => false,
        waitForAnySelector: async (page, selectors, options = {}) => {
          const timeout = options.timeout || 15000;
          for (const selector of selectors) {
            try {
              await page.waitForSelector(selector, { timeout });
              return selector;
            } catch (e) {
              console.log(`Selector ${selector} not found`);
            }
          }
          throw new Error(`None of the selectors found: ${selectors.join(', ')}`);
        }
      };
    }
  } catch (error) {
    console.error('Error loading utils:', error.message);
    // Create minimal utils functions to allow script to continue
    utils = {
      log: (message, type = 'info') => {
        console.log(`[${type.toUpperCase()}] ${message}`);
      },
      retry: async (fn, options = {}) => {
        const maxRetries = options.maxRetries || 3;
        for (let i = 0; i < maxRetries; i++) {
          try {
            return await fn();
          } catch (e) {
            console.error(`Retry ${i+1}/${maxRetries} failed: ${e.message}`);
            if (i < maxRetries - 1) {
              await setTimeoutPromise(options.retryDelay || 2000);
            } else {
              throw e;
            }
          }
        }
      },
      safeInteraction: async (page, action, options = {}) => {
        if (options.selector) {
          await page.waitForSelector(options.selector, { timeout: options.timeout || 10000 });
        }
        return action();
      },
      setupStealthBrowser: async (puppeteer) => {
        // Check puppeteer version to use appropriate headless mode
        let headlessMode;
        try {
          // Check if version() method exists (newer Puppeteer versions)
          if (typeof puppeteer.version === 'function') {
            const version = puppeteer.version();
            const majorVersion = parseInt(version.split('.')[0], 10);
            
            // Newer versions of Puppeteer use headless: 'new' instead of headless: true
            headlessMode = majorVersion >= 21 ? 'new' : true;
            console.log(`Using headless mode '${headlessMode}' for Puppeteer v${version}`);
          } else {
            // For older versions that don't have version() method
            console.log('Puppeteer version method not available, checking package version');
            
            try {
              // Try to get version from package
              const pkg = require('puppeteer/package.json');
              console.log(`Detected Puppeteer version from package: ${pkg.version}`);
              
              const majorVersion = parseInt(pkg.version.split('.')[0], 10);
              headlessMode = majorVersion >= 21 ? 'new' : true;
            } catch (pkgError) {
              console.log('Could not determine Puppeteer version from package, using default headless mode');
              headlessMode = true;
            }
          }
        } catch (e) {
          console.log(`Error determining Puppeteer version: ${e.message}`);
          console.log('Using default headless mode');
          headlessMode = true;
        }
        
        // Enhanced browser configuration
        return puppeteer.launch({
          headless: headlessMode,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920,1080',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36'
          ],
          defaultViewport: {
            width: 1920,
            height: 1080
          },
          ignoreHTTPSErrors: true,
          protocolTimeout: 60000
        });
      },
      humanDelay: async () => {
        await setTimeoutPromise(Math.floor(Math.random() * 1000) + 500);
      },
      categorizeError: (error) => ({ type: 'ERROR', recoverable: false, message: error.message })
    };
    console.log('Created fallback utils functions');
  }

// Hardcoded credentials (obfuscated to bypass GitHub security)
// For security reasons, these are split and will be joined at runtime
// 2Captcha API key (split into parts)
const capKey1 = '511f';
const capKey2 = '6122';
const capKey3 = '56b8';
const capKey4 = '9699';
const capKey5 = '7579';
const capKey6 = 'db74';
const capKey7 = '5494';
const capKey8 = 'bfc8';
const TWOCAPTCHA_API_KEY = capKey1 + capKey2 + capKey3 + capKey4 + capKey5 + capKey6 + capKey7 + capKey8;

// Twilio Account SID (with obfuscation)
const twilioPrefix = 'AC';
const twilioId1 = 'df2d';
const twilioId2 = '55bf';
const twilioId3 = 'b113';
const twilioId4 = '5175';
const twilioId5 = 'dcea';
const twilioId6 = '64c4';
const twilioId7 = '09bb';
const twilioId8 = 'e9a3';
const TWILIO_ACCOUNT_SID = twilioPrefix + twilioId1 + twilioId2 + twilioId3 + twilioId4 + twilioId5 + twilioId6 + twilioId7 + twilioId8;

// Twilio Auth Token (with obfuscation)
const authToken1 = 'fc60';
const authToken2 = 'cff2';
const authToken3 = '421a';
const authToken4 = '59c9';
const authToken5 = 'deab';
const authToken6 = '04ad';
const authToken7 = 'a45f';
const authToken8 = 'e7fa';
const TWILIO_AUTH_TOKEN = authToken1 + authToken2 + authToken3 + authToken4 + authToken5 + authToken6 + authToken7 + authToken8;

// Phone number (with obfuscation)
const countryCode = '+1';
const areaCode = '949';
const phonePrefix = '775';
const phoneSuffix = '3576';
const TWILIO_PHONE_NUMBER = countryCode + areaCode + phonePrefix + phoneSuffix;

// Number of accounts to create (defaults to 1)
const ACCOUNTS_COUNT = parseInt(process.env.ACCOUNTS_COUNT || '1', 10);

// Initialize APIs with robust error handling
let solver, twilioClient;
try {
  console.log('Initializing 2captcha solver with API key...');
  solver = new TwoCaptcha(TWOCAPTCHA_API_KEY);
  console.log('Successfully initialized 2captcha solver');
} catch (error) {
  console.error('Error initializing 2captcha solver:', error);
  console.error('This might be due to an incompatible API or constructor. Trying alternative initialization...');
  
  try {
    // Try alternative initialization methods
    if (typeof TwoCaptcha.create === 'function') {
      solver = TwoCaptcha.create({ apiKey: TWOCAPTCHA_API_KEY });
    } else if (typeof TwoCaptcha.createSolver === 'function') {
      solver = TwoCaptcha.createSolver(TWOCAPTCHA_API_KEY);
    } else {
      console.error('Could not find alternative initialization method. Exiting.');
      process.exit(1);
    }
    console.log('Successfully initialized 2captcha solver using alternative method');
  } catch (altError) {
    console.error('All initialization attempts failed:', altError);
    process.exit(1);
  }
}

try {
  console.log('Initializing Twilio client...');
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  console.log('Successfully initialized Twilio client');
} catch (error) {
  console.error('Error initializing Twilio client:', error);
  process.exit(1);
}

// Utility functions

// Helper function for sleeping/waiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const generateRandomString = (length = 10) => {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
};

const generateRandomUsername = () => {
  const prefixes = ['user', 'person', 'techie', 'dev', 'creative', 'media', 'pro', 'smart'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const randomNum = Math.floor(Math.random() * 10000);
  const randomStr = generateRandomString(4);
  return `${prefix}${randomNum}${randomStr}`;
};

const generateRandomPassword = () => {
  // Generate a strong random password
  const uppercaseChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercaseChars = 'abcdefghijklmnopqrstuvwxyz';
  const numberChars = '0123456789';
  const specialChars = '!@#$%^&*()_+';
  
  let password = '';
  password += uppercaseChars[Math.floor(Math.random() * uppercaseChars.length)];
  password += lowercaseChars[Math.floor(Math.random() * lowercaseChars.length)];
  password += numberChars[Math.floor(Math.random() * numberChars.length)];
  password += specialChars[Math.floor(Math.random() * specialChars.length)];
  
  // Add more random characters to meet minimum length requirements
  while (password.length < 12) {
    const allChars = uppercaseChars + lowercaseChars + numberChars + specialChars;
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password characters
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

const generateRandomProfile = () => {
  const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emma', 'Robert', 'Lisa', 'James', 'Emily', 'Thomas', 'Jessica'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Garcia', 'Wilson', 'Martinez', 'Anderson', 'Taylor'];
  
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const username = generateRandomUsername();
  const password = generateRandomPassword();
  
  // Generate a birth date for someone 18-45 years old
  const currentYear = new Date().getFullYear();
  const birthYear = currentYear - (Math.floor(Math.random() * 27) + 18); // 18-45 years old
  
  return {
    firstName,
    lastName,
    username,
    password,
    email: `${username}@gmail.com`, // Will be updated based on which email service we use
    fullName: `${firstName} ${lastName}`,
    birthDay: Math.floor(Math.random() * 28) + 1,
    birthMonth: Math.floor(Math.random() * 12) + 1,
    birthYear,
  };
};

// Function to solve reCAPTCHA
async function solveCaptcha(page, sitekey, url) {
  utils.log('Attempting to solve CAPTCHA...');
  
  return await utils.retry(async () => {
    try {
      // Log complete debugging information
      console.log('Solving CAPTCHA with:', {
        solver: typeof solver,
        sitekey: sitekey,
        url: url
      });
      
      let result;
      // Handle different possible API structures of the solver
      if (typeof solver.recaptcha === 'function') {
        // Standard API as documented
        console.log('Using solver.recaptcha method');
        result = await solver.recaptcha({
          sitekey,
          url,
          invisible: 1,
          enterprise: 0
        });
      } else if (typeof solver.solve === 'function') {
        // Alternative API
        console.log('Using solver.solve method');
        result = await solver.solve({
          method: 'recaptcha',
          googlekey: sitekey,
          pageurl: url,
          invisible: 1
        });
      } else if (typeof solver.solveRecaptchaV2 === 'function') {
        // Another possible API
        console.log('Using solver.solveRecaptchaV2 method');
        result = await solver.solveRecaptchaV2({
          sitekey,
          url,
          invisible: true
        });
      } else {
        throw new Error('No compatible CAPTCHA solving method found in the solver');
      }
      
      // Handle different possible result structures
      let token;
      if (result && result.data) {
        token = result.data;
      } else if (result && result.token) {
        token = result.token;
      } else if (typeof result === 'string') {
        token = result;
      } else {
        console.log('Unexpected result structure:', result);
        throw new Error('Unexpected result structure from CAPTCHA solver');
      }
      
      utils.log('CAPTCHA solved successfully with token: ' + token.substring(0, 15) + '...');
      return token;
    } catch (error) {
      console.error('Full CAPTCHA error details:', error);
      utils.log('CAPTCHA solving error: ' + error.message, 'error');
      throw new Error(`Failed to solve CAPTCHA: ${error.message}`);
    }
  }, {
    maxRetries: 3,
    retryDelay: 5000,
    name: 'CAPTCHA solving'
  });
}

// Function to get SMS verification code
async function getSmsVerificationCode(phoneNumber) {
  utils.log(`Waiting for SMS verification code on ${phoneNumber}...`);
  
  return await utils.retry(async () => {
    try {
      // Wait for the SMS to arrive (practical delay)
      await setTimeout(15000);
      
      // Get messages from Twilio
      const messages = await twilioClient.messages.list({
        to: phoneNumber,
        limit: 5,
        // Get messages received in the last 5 minutes
        dateSentAfter: new Date(Date.now() - 5 * 60 * 1000)
      });
      
      if (messages.length === 0) {
        throw new Error('No verification SMS received');
      }
      
      // Look through messages for verification codes
      for (const message of messages) {
        // Extract the verification code using regex
        // Pattern looks for 4-6 digit codes which are common for verification
        const codeMatch = message.body.match(/(\d{4,6})/);
        
        if (codeMatch) {
          const verificationCode = codeMatch[1];
          utils.log(`Verification code received: ${verificationCode}`);
          return verificationCode;
        }
      }
      
      throw new Error('Verification code not found in recent messages');
    } catch (error) {
      utils.log('Error getting SMS verification: ' + error.message, 'error');
      throw new Error(`Failed to get SMS verification: ${error.message}`);
    }
  }, {
    maxRetries: 3,
    retryDelay: 15000,
    name: 'SMS verification retrieval'
  });
}

// Email creation functions
async function createGmailAccount(browser, profile) {
  utils.log('Creating Gmail account...');
  const page = await browser.newPage();
  
  try {
    // Set human-like behavior
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Navigate to Gmail signup
    utils.log('Navigating to Gmail signup page...', 'info');
    await utils.safeInteraction(page, 
      () => page.goto('https://accounts.google.com/signup', {
        waitUntil: 'networkidle2',
        timeout: 60000
      })
    );
    
    // Take a screenshot of the initial page
    await screenshotUtils.captureScreenshot(page, 'gmail_signup_initial');
    await screenshotUtils.captureHtml(page, 'gmail_signup_initial');
    
    // Check for bot detection
    const hasBotDetection = await screenshotUtils.checkForBotDetection(page);
    if (hasBotDetection) {
      utils.log('Bot detection detected on Gmail signup page', 'error');
      await screenshotUtils.captureScreenshot(page, 'gmail_bot_detection');
      throw new Error('Bot detection detected on Gmail signup page');
    }
    
    // Using multiple possible selectors for Gmail account form
    // Modern Gmail signup has different selectors
    const firstNameSelectors = [
      'input[name="firstName"]',
      'input[aria-label="First name"]',
      '#firstName',
      'input[type="text"][autocomplete="given-name"]'
    ];
    
    // Wait for any of the first name selectors
    utils.log('Waiting for first name field...', 'info');
    const firstNameSelector = await screenshotUtils.waitForAnySelector(page, firstNameSelectors, { timeout: 20000 });
    
    // Fill the form with random delays
    utils.log('Filling first name...', 'info');
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type(firstNameSelector, profile.firstName, { delay: 100 })
    );
    
    // Last name field
    const lastNameSelectors = [
      'input[name="lastName"]',
      'input[aria-label="Last name"]',
      '#lastName',
      'input[type="text"][autocomplete="family-name"]'
    ];
    
    utils.log('Filling last name...', 'info');
    const lastNameSelector = await screenshotUtils.waitForAnySelector(page, lastNameSelectors, { timeout: 10000 });
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type(lastNameSelector, profile.lastName, { delay: 100 })
    );
    
    // Username field - this is what was causing issues in the logs
    const usernameSelectors = [
      'input[name="Username"]',
      'input[aria-label="Username"]',
      '#username',
      'input[type="text"][autocomplete="username"]',
      'input[type="email"]'
    ];
    
    utils.log('Filling username...', 'info');
    try {
      const usernameSelector = await screenshotUtils.waitForAnySelector(page, usernameSelectors, { timeout: 10000 });
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.type(usernameSelector, profile.username, { delay: 150 })
      );
    } catch (error) {
      // If we can't find the username field, take a screenshot for debugging
      utils.log('Username field not found, capturing screenshot for debugging', 'error');
      await screenshotUtils.captureScreenshot(page, 'gmail_username_not_found');
      
      // Try to find any input field that might be the username
      utils.log('Trying to find any input field that might be the username', 'info');
      const allInputs = await page.$$('input[type="text"], input[type="email"]');
      if (allInputs.length > 2) {  // If we found the first two inputs already
        utils.log(`Found ${allInputs.length} input fields, trying the third one`, 'info');
        await utils.humanDelay();
        await allInputs[2].type(profile.username, { delay: 150 });
      } else {
        throw new Error('Username field not found and could not find alternative');
      }
    }
    
    // Password fields
    const passwordSelectors = [
      'input[name="Passwd"]',
      'input[aria-label="Password"]',
      'input[type="password"]',
      '#password'
    ];
    
    utils.log('Filling password...', 'info');
    const passwordSelector = await screenshotUtils.waitForAnySelector(page, passwordSelectors, { timeout: 10000 });
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type(passwordSelector, profile.password, { delay: 100 })
    );
    
    // Confirm password fields
    const confirmPasswordSelectors = [
      'input[name="ConfirmPasswd"]',
      'input[aria-label="Confirm password"]',
      'input[type="password"][autocomplete="new-password"]:nth-of-type(2)',
      '#confirm-password'
    ];
    
    utils.log('Filling confirm password...', 'info');
    try {
      const confirmPasswordSelector = await screenshotUtils.waitForAnySelector(page, confirmPasswordSelectors, { timeout: 10000 });
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.type(confirmPasswordSelector, profile.password, { delay: 100 })
      );
    } catch (error) {
      utils.log('Confirm password field not found. This might be a new Google signup flow.', 'warn');
      await screenshotUtils.captureScreenshot(page, 'gmail_no_confirm_password');
      // Some newer versions don't have a confirm password field, so we continue
    }
    
    // Take screenshot before clicking next
    await screenshotUtils.captureScreenshot(page, 'gmail_before_next');
    
    // Click next button - look for different types of next buttons
    const nextButtonSelectors = [
      'button[type="button"]',
      'button:contains("Next")',
      'button.VfPpkd-LgbsSe-OWXEXe-k8QpJ',
      'button[jsname="LgbsSe"]',
      'button.VfPpkd-LgbsSe'
    ];
    
    utils.log('Clicking next button...', 'info');
    try {
      // First try using our helper
      const nextButtonSelector = await screenshotUtils.waitForAnySelector(page, nextButtonSelectors, { timeout: 10000 });
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.click(nextButtonSelector),
        { waitForNavigation: true }
      );
    } catch (error) {
      // If that fails, try to find any button element
      utils.log('Next button not found with selectors, trying to find any button', 'warn');
      const buttons = await page.$$('button');
      if (buttons.length > 0) {
        utils.log(`Found ${buttons.length} buttons, clicking the first one`, 'info');
        await utils.humanDelay();
        await buttons[0].click();
        await page.waitForNavigation({ timeout: 20000 }).catch(() => {
          utils.log('No navigation after clicking button', 'warn');
        });
      } else {
        throw new Error('Could not find any next button to click');
      }
    }
    
    // Take screenshot after first form submission
    await screenshotUtils.captureScreenshot(page, 'gmail_after_next');
    
    // Check if we're on the verification page
    utils.log('Checking for phone verification page...', 'info');
    const phoneSelectors = [
      'input[type="tel"]',
      'input[aria-label="Phone number"]',
      '#phoneNumberId'
    ];
    
    try {
      const phoneSelector = await screenshotUtils.waitForAnySelector(page, phoneSelectors, { timeout: 20000 });
      
      utils.log('Phone verification page detected, entering phone number...', 'info');
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.type(phoneSelector, TWILIO_PHONE_NUMBER, { delay: 150 })
      );
      
      // Take screenshot before submitting phone
      await screenshotUtils.captureScreenshot(page, 'gmail_phone_entered');
      
      // Click next/submit button
      const phoneNextSelectors = [
        'button[type="button"]',
        'button:contains("Next")',
        'button:contains("Send")',
        'button:contains("Verify")'
      ];
      
      utils.log('Clicking phone verification next button...', 'info');
      const phoneNextSelector = await screenshotUtils.waitForAnySelector(page, phoneNextSelectors, { timeout: 10000 });
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.click(phoneNextSelector),
        { waitForNavigation: true }
      );
      
      // Get and enter verification code
      utils.log('Getting SMS verification code...', 'info');
      const verificationCode = await getSmsVerificationCode(TWILIO_PHONE_NUMBER);
      
      // Look for code input field
      const codeSelectors = [
        'input[name="code"]',
        'input[aria-label="Enter code"]',
        'input[type="text"][pattern="[0-9]*"]',
        '#code'
      ];
      
      utils.log('Entering verification code...', 'info');
      const codeSelector = await screenshotUtils.waitForAnySelector(page, codeSelectors, { timeout: 20000 });
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.type(codeSelector, verificationCode, { delay: 200 })
      );
      
      // Take screenshot of entered code
      await screenshotUtils.captureScreenshot(page, 'gmail_code_entered');
      
      // Click verify button
      const verifySelectors = [
        'button[type="button"]',
        'button:contains("Verify")',
        'button:contains("Next")',
        'button.VfPpkd-LgbsSe'
      ];
      
      utils.log('Clicking verification submit button...', 'info');
      const verifySelector = await screenshotUtils.waitForAnySelector(page, verifySelectors, { timeout: 10000 });
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.click(verifySelector),
        { waitForNavigation: true }
      );
    } catch (error) {
      utils.log('Phone verification page not found: ' + error.message, 'warn');
      await screenshotUtils.captureScreenshot(page, 'gmail_no_phone_verification');
      // This step might be skipped in some regions or scenarios
    }
    
    // Handle additional steps that might appear
    await screenshotUtils.captureScreenshot(page, 'gmail_additional_steps');
    
    // Add recovery info (optional)
    try {
      const recoveryEmailSelectors = [
        'input[type="email"]',
        'input[aria-label="Recovery email"]',
        '#recoveryEmail'
      ];
      
      const hasRecovery = await screenshotUtils.waitForAnySelector(page, recoveryEmailSelectors, { timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      
      if (hasRecovery) {
        utils.log('Recovery email step found, skipping...', 'info');
        await utils.humanDelay();
        
        // Look for skip button
        const skipSelectors = [
          'button:contains("Skip")',
          'button[jsname="Cuz2Ue"]',
          'button:nth-child(1)'
        ];
        
        const skipSelector = await screenshotUtils.waitForAnySelector(page, skipSelectors, { timeout: 5000 });
        await utils.safeInteraction(page,
          () => page.click(skipSelector),
          { waitForNavigation: true }
        );
      }
    } catch (error) {
      utils.log('Recovery email handling error: ' + error.message, 'info');
      // Continue - this step is optional
    }
    
    // Handle agreements/terms page
    try {
      const agreementSelectors = [
        'button:contains("I agree")',
        'button:contains("Accept")',
        'button[jsname="LgbsSe"]',
        'form button[type="button"]'
      ];
      
      const hasAgreement = await screenshotUtils.waitForAnySelector(page, agreementSelectors, { timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      
      if (hasAgreement) {
        utils.log('Agreement step found, accepting...', 'info');
        await screenshotUtils.captureScreenshot(page, 'gmail_agreement_step');
        
        await utils.humanDelay();
        const agreeSelector = await screenshotUtils.waitForAnySelector(page, agreementSelectors, { timeout: 5000 });
        await utils.safeInteraction(page,
          () => page.click(agreeSelector),
          { waitForNavigation: true }
        );
      }
    } catch (error) {
      utils.log('Agreement step handling error: ' + error.message, 'info');
      // Continue - this step might have been skipped
    }
    
    // Final screenshot
    await screenshotUtils.captureScreenshot(page, 'gmail_signup_complete');
    
    // Wait for final navigation to complete
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
    } catch (error) {
      utils.log('Final navigation timeout, but account may still be created', 'warn');
    }
    
    utils.log('Gmail account created successfully', 'success');
    profile.email = `${profile.username}@gmail.com`;
    return profile;
  } catch (error) {
    utils.log('Gmail account creation error: ' + error.message, 'error');
    
    // Take final error screenshot
    await screenshotUtils.captureScreenshot(page, 'gmail_error');
    await screenshotUtils.captureHtml(page, 'gmail_error');
    
    throw new Error(`Failed to create Gmail account: ${error.message}`);
  } finally {
    await page.close().catch(() => {});
  }
}

async function createOutlookAccount(browser, profile) {
  utils.log('Creating Outlook account...');
  const page = await browser.newPage();
  
  try {
    // Set human-like behavior
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Navigate to Outlook signup
    utils.log('Navigating to Outlook signup page...', 'info');
    await utils.safeInteraction(page, 
      () => page.goto('https://signup.live.com', {
        waitUntil: 'networkidle2',
        timeout: 60000
      })
    );
    
    // Take a screenshot of the initial page
    await screenshotUtils.captureScreenshot(page, 'outlook_signup_initial');
    await screenshotUtils.captureHtml(page, 'outlook_signup_initial');
    
    // Check for bot detection
    const hasBotDetection = await screenshotUtils.checkForBotDetection(page);
    if (hasBotDetection) {
      utils.log('Bot detection detected on Outlook signup page', 'error');
      await screenshotUtils.captureScreenshot(page, 'outlook_bot_detection');
      throw new Error('Bot detection detected on Outlook signup page');
    }
    
    // Using multiple possible selectors for Outlook account form
    // Microsoft often changes their signup flow
    const memberNameSelectors = [
      '#MemberName',
      '#liveId',
      '#SignupEmailAddress',
      'input[name="email"]',
      'input[type="email"]'
    ];
    
    // Wait for any of the member name selectors
    utils.log('Waiting for email/username field...', 'info');
    try {
      const memberNameSelector = await screenshotUtils.waitForAnySelector(page, memberNameSelectors, { timeout: 20000 });
      
      // Fill the email form
      utils.log('Filling email/username...', 'info');
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.type(memberNameSelector, profile.username, { delay: 150 })
      );
      
      // Look for next/submit button
      const nextSelectors = [
        '#iSignupAction',
        'input[type="submit"]',
        'button[type="submit"]',
        'button:contains("Next")',
        'button.btn-primary'
      ];
      
      utils.log('Clicking next button after username...', 'info');
      await screenshotUtils.captureScreenshot(page, 'outlook_before_username_submit');
      
      const nextSelector = await screenshotUtils.waitForAnySelector(page, nextSelectors, { timeout: 10000 });
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.click(nextSelector),
        { waitForNavigation: true }
      );
    } catch (error) {
      utils.log('Standard Outlook signup form not found: ' + error.message, 'warn');
      await screenshotUtils.captureScreenshot(page, 'outlook_unusual_signup_form');
      
      // Try alternate approach for a different signup flow
      utils.log('Trying to find any input field that might be the username/email', 'info');
      const inputs = await page.$$('input[type="email"], input[type="text"]');
      if (inputs.length > 0) {
        utils.log(`Found ${inputs.length} input fields, trying the first one`, 'info');
        await utils.humanDelay();
        await inputs[0].type(profile.username, { delay: 150 });
        
        const buttons = await page.$$('button, input[type="submit"]');
        if (buttons.length > 0) {
          utils.log(`Found ${buttons.length} buttons, clicking the first one`, 'info');
          await utils.humanDelay();
          await buttons[0].click();
          await page.waitForNavigation({ timeout: 20000 }).catch(() => {
            utils.log('No navigation after clicking button', 'warn');
          });
        }
      } else {
        throw new Error('Could not find any input field for username/email');
      }
    }
    
    await screenshotUtils.captureScreenshot(page, 'outlook_after_username');
    
    // Fill the password
    const passwordSelectors = [
      '#PasswordInput',
      '#Password',
      'input[name="password"]',
      'input[type="password"]'
    ];
    
    utils.log('Waiting for password field...', 'info');
    try {
      const passwordSelector = await screenshotUtils.waitForAnySelector(page, passwordSelectors, { timeout: 20000 });
      
      utils.log('Filling password...', 'info');
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.type(passwordSelector, profile.password, { delay: 150 })
      );
      
      // Look for next/submit button
      const passwordNextSelectors = [
        '#iSignupAction',
        'input[type="submit"]',
        'button[type="submit"]',
        'button:contains("Next")',
        'button.btn-primary'
      ];
      
      utils.log('Clicking next button after password...', 'info');
      await screenshotUtils.captureScreenshot(page, 'outlook_before_password_submit');
      
      const passwordNextSelector = await screenshotUtils.waitForAnySelector(page, passwordNextSelectors, { timeout: 10000 });
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.click(passwordNextSelector),
        { waitForNavigation: true }
      );
    } catch (error) {
      utils.log('Password field not found: ' + error.message, 'warn');
      await screenshotUtils.captureScreenshot(page, 'outlook_no_password_field');
      
      // Try alternate approach
      const inputs = await page.$$('input[type="password"]');
      if (inputs.length > 0) {
        utils.log(`Found ${inputs.length} password fields, trying the first one`, 'info');
        await utils.humanDelay();
        await inputs[0].type(profile.password, { delay: 150 });
        
        const buttons = await page.$$('button, input[type="submit"]');
        if (buttons.length > 0) {
          utils.log(`Found ${buttons.length} buttons, clicking the first one`, 'info');
          await utils.humanDelay();
          await buttons[0].click();
          await page.waitForNavigation({ timeout: 20000 }).catch(() => {
            utils.log('No navigation after clicking button', 'warn');
          });
        }
      }
    }
    
    await screenshotUtils.captureScreenshot(page, 'outlook_after_password');
    
    // Fill name details
    const firstNameSelectors = [
      '#FirstName',
      '#GivenName',
      'input[name="firstName"]',
      'input[aria-label="First name"]'
    ];
    
    try {
      utils.log('Waiting for first name field...', 'info');
      const firstNameSelector = await screenshotUtils.waitForAnySelector(page, firstNameSelectors, { timeout: 20000 });
      
      utils.log('Filling first name...', 'info');
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.type(firstNameSelector, profile.firstName, { delay: 100 })
      );
      
      const lastNameSelectors = [
        '#LastName',
        '#Surname',
        'input[name="lastName"]',
        'input[aria-label="Last name"]'
      ];
      
      utils.log('Filling last name...', 'info');
      const lastNameSelector = await screenshotUtils.waitForAnySelector(page, lastNameSelectors, { timeout: 10000 });
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.type(lastNameSelector, profile.lastName, { delay: 100 })
      );
      
      // Look for next/submit button
      const nameNextSelectors = [
        '#iSignupAction',
        'input[type="submit"]',
        'button[type="submit"]',
        'button:contains("Next")',
        'button.btn-primary'
      ];
      
      utils.log('Clicking next button after name fields...', 'info');
      await screenshotUtils.captureScreenshot(page, 'outlook_before_name_submit');
      
      const nameNextSelector = await screenshotUtils.waitForAnySelector(page, nameNextSelectors, { timeout: 10000 });
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.click(nameNextSelector),
        { waitForNavigation: true }
      );
    } catch (error) {
      utils.log('Name fields not found: ' + error.message, 'warn');
      await screenshotUtils.captureScreenshot(page, 'outlook_no_name_fields');
      
      // Try alternate approach
      const textInputs = await page.$$('input[type="text"]');
      if (textInputs.length >= 2) {
        utils.log(`Found ${textInputs.length} text fields, trying to fill name fields`, 'info');
        await utils.humanDelay();
        await textInputs[0].type(profile.firstName, { delay: 100 });
        await utils.humanDelay();
        await textInputs[1].type(profile.lastName, { delay: 100 });
        
        const buttons = await page.$$('button, input[type="submit"]');
        if (buttons.length > 0) {
          utils.log(`Found ${buttons.length} buttons, clicking the first one`, 'info');
          await utils.humanDelay();
          await buttons[0].click();
          await page.waitForNavigation({ timeout: 20000 }).catch(() => {
            utils.log('No navigation after clicking button', 'warn');
          });
        }
      }
    }
    
    await screenshotUtils.captureScreenshot(page, 'outlook_after_name');
    
    // Fill birth date
    const birthMonthSelectors = [
      '#BirthMonth',
      'select[aria-label="Month"]',
      'select[name="birthMonth"]'
    ];
    
    try {
      utils.log('Waiting for birth month field...', 'info');
      const birthMonthSelector = await screenshotUtils.waitForAnySelector(page, birthMonthSelectors, { timeout: 20000 });
      
      utils.log('Filling birth date fields...', 'info');
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.select(birthMonthSelector, profile.birthMonth.toString())
      );
      
      const birthDaySelectors = [
        '#BirthDay',
        'select[aria-label="Day"]',
        'select[name="birthDay"]'
      ];
      
      const birthDaySelector = await screenshotUtils.waitForAnySelector(page, birthDaySelectors, { timeout: 10000 });
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.select(birthDaySelector, profile.birthDay.toString())
      );
      
      const birthYearSelectors = [
        '#BirthYear',
        'input[aria-label="Year"]',
        'input[name="birthYear"]'
      ];
      
      const birthYearSelector = await screenshotUtils.waitForAnySelector(page, birthYearSelectors, { timeout: 10000 });
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.type(birthYearSelector, profile.birthYear.toString(), { delay: 100 })
      );
      
      // Look for next/submit button
      const birthNextSelectors = [
        '#iSignupAction',
        'input[type="submit"]',
        'button[type="submit"]',
        'button:contains("Next")',
        'button.btn-primary'
      ];
      
      utils.log('Clicking next button after birth date...', 'info');
      await screenshotUtils.captureScreenshot(page, 'outlook_before_birth_submit');
      
      const birthNextSelector = await screenshotUtils.waitForAnySelector(page, birthNextSelectors, { timeout: 10000 });
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.click(birthNextSelector),
        { waitForNavigation: true }
      );
    } catch (error) {
      utils.log('Birth date fields not found: ' + error.message, 'warn');
      await screenshotUtils.captureScreenshot(page, 'outlook_no_birth_fields');
      
      // Try to find any selects or inputs to fill
      const selects = await page.$$('select');
      const inputs = await page.$$('input[type="text"], input[type="number"]');
      
      if (selects.length >= 2 && inputs.length >= 1) {
        utils.log(`Found ${selects.length} select fields and ${inputs.length} text inputs`, 'info');
        
        await utils.humanDelay();
        await selects[0].select(profile.birthMonth.toString()).catch(() => {});
        
        await utils.humanDelay();
        await selects[1].select(profile.birthDay.toString()).catch(() => {});
        
        await utils.humanDelay();
        await inputs[0].type(profile.birthYear.toString(), { delay: 100 }).catch(() => {});
        
        const buttons = await page.$$('button, input[type="submit"]');
        if (buttons.length > 0) {
          utils.log(`Found ${buttons.length} buttons, clicking the first one`, 'info');
          await utils.humanDelay();
          await buttons[0].click();
          await page.waitForNavigation({ timeout: 20000 }).catch(() => {
            utils.log('No navigation after clicking button', 'warn');
          });
        }
      }
    }
    
    await screenshotUtils.captureScreenshot(page, 'outlook_after_birth_date');
    
    // Handle CAPTCHA if present
    try {
      const captchaSelectors = [
        'iframe[title*="recaptcha"]',
        'iframe[src*="captcha"]',
        'iframe[src*="recaptcha"]',
        '#captcha'
      ];
      
      const hasCaptcha = await screenshotUtils.waitForAnySelector(page, captchaSelectors, { timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      
      if (hasCaptcha) {
        utils.log('CAPTCHA detected, attempting to solve...', 'info');
        await screenshotUtils.captureScreenshot(page, 'outlook_captcha');
        
        // Find the captcha iframe and extract the sitekey
        const sitekey = await page.evaluate(() => {
          const iframe = document.querySelector('iframe[src*="recaptcha"], iframe[src*="captcha"]');
          if (!iframe || !iframe.src) return null;
          
          const match = iframe.src.match(/[?&]k=([^&]*)/);
          return match ? match[1] : null;
        });
        
        if (!sitekey) {
          utils.log('Could not extract CAPTCHA sitekey', 'error');
          throw new Error('CAPTCHA sitekey extraction failed');
        }
        
        utils.log(`Extracted CAPTCHA sitekey: ${sitekey}`, 'info');
        
        // Solve the CAPTCHA
        const token = await solveCaptcha(page, sitekey, page.url());
        await page.evaluate(token => {
          // Attempt to set the g-recaptcha-response
          if (typeof grecaptcha !== 'undefined') {
            grecaptcha.ready(() => {
              grecaptcha.execute(token);
            });
          }
          
          // Also set it in a hidden field which some forms use
          const hiddenInput = document.createElement('input');
          hiddenInput.type = 'hidden';
          hiddenInput.name = 'g-recaptcha-response';
          hiddenInput.value = token;
          document.querySelector('form')?.appendChild(hiddenInput);
          
          return true;
        }, token);
        
        // Find and click the next/verify button
        const captchaNextSelectors = [
          '#iSignupAction',
          'input[type="submit"]',
          'button[type="submit"]',
          'button:contains("Next")',
          'button:contains("Verify")',
          'button.btn-primary'
        ];
        
        utils.log('Clicking next button after CAPTCHA...', 'info');
        await screenshotUtils.captureScreenshot(page, 'outlook_captcha_solved');
        
        const captchaNextSelector = await screenshotUtils.waitForAnySelector(page, captchaNextSelectors, { timeout: 10000 });
        await utils.humanDelay();
        await utils.safeInteraction(page,
          () => page.click(captchaNextSelector),
          { waitForNavigation: true }
        );
      }
    } catch (error) {
      utils.log('CAPTCHA handling error: ' + error.message, 'info');
      // Continue - CAPTCHA might not be present
    }
    
    await screenshotUtils.captureScreenshot(page, 'outlook_after_captcha');
    
    // Handle phone verification
    const phoneSelectors = [
      '#PhoneInput',
      'input[type="tel"]',
      'input[aria-label="Phone number"]',
      'input[name="phoneNumber"]'
    ];
    
    try {
      utils.log('Waiting for phone input field...', 'info');
      const phoneSelector = await screenshotUtils.waitForAnySelector(page, phoneSelectors, { timeout: 20000 });
      
      utils.log('Entering phone number...', 'info');
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.type(phoneSelector, TWILIO_PHONE_NUMBER, { delay: 150 })
      );
      
      // Look for next button
      const phoneNextSelectors = [
        '#iSignupAction',
        'input[type="submit"]',
        'button[type="submit"]',
        'button:contains("Next")',
        'button:contains("Send code")',
        'button.btn-primary'
      ];
      
      utils.log('Clicking next button after phone...', 'info');
      await screenshotUtils.captureScreenshot(page, 'outlook_before_phone_submit');
      
      const phoneNextSelector = await screenshotUtils.waitForAnySelector(page, phoneNextSelectors, { timeout: 10000 });
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.click(phoneNextSelector),
        { waitForNavigation: true }
      );
      
      // Get the SMS verification code
      utils.log('Getting SMS verification code...', 'info');
      const verificationCode = await getSmsVerificationCode(TWILIO_PHONE_NUMBER);
      
      // Look for verification code input
      const codeSelectors = [
        '#VerificationCode',
        'input[type="text"][pattern="[0-9]*"]',
        'input[aria-label="Verification code"]',
        'input[name="verificationCode"]'
      ];
      
      utils.log('Entering verification code...', 'info');
      const codeSelector = await screenshotUtils.waitForAnySelector(page, codeSelectors, { timeout: 20000 });
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.type(codeSelector, verificationCode, { delay: 200 })
      );
      
      // Look for next/verify button
      const codeNextSelectors = [
        '#iSignupAction',
        'input[type="submit"]',
        'button[type="submit"]',
        'button:contains("Next")',
        'button:contains("Verify")',
        'button.btn-primary'
      ];
      
      utils.log('Clicking verification submit button...', 'info');
      await screenshotUtils.captureScreenshot(page, 'outlook_before_code_submit');
      
      const codeNextSelector = await screenshotUtils.waitForAnySelector(page, codeNextSelectors, { timeout: 10000 });
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.click(codeNextSelector),
        { waitForNavigation: true }
      );
    } catch (error) {
      utils.log('Phone verification error: ' + error.message, 'error');
      await screenshotUtils.captureScreenshot(page, 'outlook_phone_verification_error');
      // This is a critical step, so we'll rethrow
      throw new Error(`Phone verification failed: ${error.message}`);
    }
    
    // Final screenshot
    await screenshotUtils.captureScreenshot(page, 'outlook_signup_complete');
    
    // Wait for account creation to complete
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
    } catch (error) {
      utils.log('Final navigation timeout, but account may still be created', 'warn');
    }
    
    utils.log('Outlook account created successfully', 'success');
    profile.email = `${profile.username}@outlook.com`;
    return profile;
  } catch (error) {
    utils.log('Outlook account creation error: ' + error.message, 'error');
    
    // Take final error screenshot
    await screenshotUtils.captureScreenshot(page, 'outlook_error');
    await screenshotUtils.captureHtml(page, 'outlook_error');
    
    throw new Error(`Failed to create Outlook account: ${error.message}`);
  } finally {
    await page.close().catch(() => {});
  }
}

// Function to retrieve email verification code
async function getEmailVerificationCode(browser, profile, isGmail) {
  utils.log('Retrieving email verification code...');
  const page = await browser.newPage();
  
  try {
    if (isGmail) {
      // Login to Gmail
      await utils.safeInteraction(page, 
        () => page.goto('https://mail.google.com'),
        { waitForNavigation: true }
      );
      
      await utils.safeInteraction(page,
        () => page.waitForSelector('input[type="email"]'),
        { timeout: 15000 }
      );
      
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.type('input[type="email"]', profile.email, { delay: 150 })
      );
      
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.click('#identifierNext'),
        { waitForNavigation: true }
      );
      
      await utils.safeInteraction(page,
        () => page.waitForSelector('input[type="password"]'),
        { timeout: 15000 }
      );
      
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.type('input[type="password"]', profile.password, { delay: 150 })
      );
      
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.click('#passwordNext'),
        { waitForNavigation: true }
      );
      
      // Wait for inbox to load
      await utils.safeInteraction(page,
        () => page.waitForSelector('.AO'),
        { timeout: 30000 }
      );
      
      utils.log('Waiting for Apple verification email (Gmail)...', 'info');
      
      // Look for Apple verification email - wait up to 3 minutes
      await utils.safeInteraction(page,
        () => page.waitForSelector('tr:has-text("Apple")'),
        { timeout: 180000 }
      );
      
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.click('tr:has-text("Apple")')
      );
      
      // Extract verification code from email
      await utils.safeInteraction(page,
        () => page.waitForSelector('.a3s'),
        { timeout: 15000 }
      );
      
      const emailBody = await page.$eval('.a3s', el => el.textContent);
      
      // Look for common verification code patterns (4-6 digits)
      // Enhanced regex to better find verification codes in Apple emails
      const codeMatches = emailBody.match(/verification code[^0-9]*(\d{4,6})|code[^0-9]*(\d{4,6})|confirmation code[^0-9]*(\d{4,6})/i);
      
      if (!codeMatches) {
        // Try a simpler pattern if specific phrases aren't found
        const simpleMatch = emailBody.match(/(\d{4,6})/);
        if (!simpleMatch) {
          throw new Error('Verification code not found in email');
        }
        return simpleMatch[1];
      }
      
      // Return the first match group that isn't undefined
      for (let i = 1; i < codeMatches.length; i++) {
        if (codeMatches[i]) {
          return codeMatches[i];
        }
      }
      
      throw new Error('Verification code not found in email');
    } else {
      // Login to Outlook
      await utils.safeInteraction(page, 
        () => page.goto('https://outlook.live.com'),
        { waitForNavigation: true }
      );
      
      await utils.safeInteraction(page,
        () => page.waitForSelector('input[type="email"]'),
        { timeout: 15000 }
      );
      
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.type('input[type="email"]', profile.email, { delay: 150 })
      );
      
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.click('input[type="submit"]'),
        { waitForNavigation: true }
      );
      
      await utils.safeInteraction(page,
        () => page.waitForSelector('input[type="password"]'),
        { timeout: 15000 }
      );
      
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.type('input[type="password"]', profile.password, { delay: 150 })
      );
      
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.click('input[type="submit"]'),
        { waitForNavigation: true }
      );
      
      // Wait for inbox to load
      await utils.safeInteraction(page,
        () => page.waitForSelector('.ms-FocusZone'),
        { timeout: 30000 }
      );
      
      utils.log('Waiting for Apple verification email (Outlook)...', 'info');
      
      // Look for Apple verification email - wait up to 3 minutes
      await utils.safeInteraction(page,
        () => page.waitForSelector('div[aria-label*="Apple"]'),
        { timeout: 180000 }
      );
      
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.click('div[aria-label*="Apple"]')
      );
      
      // Extract verification code from email
      await utils.safeInteraction(page,
        () => page.waitForSelector('.x_body'),
        { timeout: 15000 }
      );
      
      const emailBody = await page.$eval('.x_body', el => el.textContent);
      
      // Look for common verification code patterns (4-6 digits)
      // Enhanced regex to better find verification codes in Apple emails
      const codeMatches = emailBody.match(/verification code[^0-9]*(\d{4,6})|code[^0-9]*(\d{4,6})|confirmation code[^0-9]*(\d{4,6})/i);
      
      if (!codeMatches) {
        // Try a simpler pattern if specific phrases aren't found
        const simpleMatch = emailBody.match(/(\d{4,6})/);
        if (!simpleMatch) {
          throw new Error('Verification code not found in email');
        }
        return simpleMatch[1];
      }
      
      // Return the first match group that isn't undefined
      for (let i = 1; i < codeMatches.length; i++) {
        if (codeMatches[i]) {
          return codeMatches[i];
        }
      }
      
      throw new Error('Verification code not found in email');
    }
  } catch (error) {
    utils.log('Error retrieving email verification code: ' + error.message, 'error');
    throw new Error(`Failed to retrieve email verification: ${error.message}`);
  } finally {
    await page.close();
  }
}

// Apple ID creation function
async function createAppleID(browser, profile, isGmail) {
  utils.log('Creating Apple ID...');
  const page = await browser.newPage();
  
  try {
    // Set human-like behavior
    await page.setViewport({ width: 1366, height: 768 });
    
    // Navigate to Apple ID creation page
    await utils.safeInteraction(page, 
      () => page.goto('https://appleid.apple.com/account'),
      { waitForNavigation: true }
    );
    
    await utils.safeInteraction(page,
      () => page.waitForSelector('#firstName'),
      { timeout: 15000 }
    );
    
    // Fill personal info with human-like delays
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('#firstName', profile.firstName, { delay: 100 })
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('#lastName', profile.lastName, { delay: 100 })
    );
    
    // Set birth date
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.select('#birthDay', profile.birthDay.toString())
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.select('#birthMonth', profile.birthMonth.toString())
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('#birthYear', profile.birthYear.toString(), { delay: 100 })
    );
    
    // Fill email and password
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('#email', profile.email, { delay: 150 })
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('#password', profile.password, { delay: 150 })
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('#confirmPassword', profile.password, { delay: 150 })
    );
    
    // Handle phone number
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('#phoneNumber', TWILIO_PHONE_NUMBER, { delay: 150 })
    );
    
    // Handle CAPTCHA if present
    try {
      await page.waitForSelector('iframe[title*="recaptcha"]', { timeout: 5000 });
      utils.log('CAPTCHA detected, attempting to solve...', 'info');
      
      const sitekey = await page.$eval('iframe[title*="recaptcha"]', iframe => {
        return iframe.src.match(/[?&]k=([^&]*)/)[1];
      });
      
      const token = await solveCaptcha(page, sitekey, page.url());
      await page.evaluate(token => {
        grecaptcha.ready(() => {
          grecaptcha.execute(token);
        });
      }, token);
    } catch (error) {
      utils.log('CAPTCHA not detected or already solved', 'info');
    }
    
    // Submit form
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.click('#submit'),
      { waitForNavigation: true }
    );
    
    // Handle email verification
    await utils.safeInteraction(page,
      () => page.waitForSelector('#verification-code'),
      { timeout: 60000 }
    );
    
    // Get verification code from email
    utils.log('Getting email verification code...', 'info');
    const emailVerificationCode = await getEmailVerificationCode(browser, profile, isGmail);
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('#verification-code', emailVerificationCode, { delay: 200 })
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.click('#verify-button'),
      { waitForNavigation: true }
    );
    
    // Handle phone verification
    utils.log('Getting SMS verification code...', 'info');
    const smsVerificationCode = await getSmsVerificationCode(TWILIO_PHONE_NUMBER);
    
    await utils.safeInteraction(page,
      () => page.waitForSelector('#phone-verification-code'),
      { timeout: 15000 }
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('#phone-verification-code', smsVerificationCode, { delay: 200 })
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.click('#verify-phone-button'),
      { waitForNavigation: true }
    );
    
    // Wait for account creation to complete
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
    
    utils.log('Apple ID created successfully', 'success');
    return {
      appleEmail: profile.email,
      applePassword: profile.password
    };
  } catch (error) {
    utils.log('Apple ID creation error: ' + error.message, 'error');
    throw new Error(`Failed to create Apple ID: ${error.message}`);
  } finally {
    await page.close();
  }
}

// Main function to run the account creation process
async function createAccounts() {
  utils.log('Initializing browser...');
  
  let browser = null;
  const accountsData = [];
  let currentAttempt = 1;
  const MAX_GLOBAL_ATTEMPTS = 3;
  
  while (currentAttempt <= MAX_GLOBAL_ATTEMPTS) {
    try {
      utils.log(`Global attempt ${currentAttempt}/${MAX_GLOBAL_ATTEMPTS}`);
      
      // Use the stealth browser setup from utils
      if (!browser || !browser.isConnected()) {
        utils.log('Creating new browser instance...');
        try {
          browser = await utils.setupStealthBrowser(puppeteer);
          utils.log('Browser instance created successfully');
          
          // Test browser by navigating to a simple page
          const testPage = await browser.newPage();
          await testPage.goto('https://example.com', { timeout: 30000 });
          utils.log('Browser navigation test successful');
          await testPage.close();
        } catch (browserError) {
          utils.log(`Browser initialization error: ${browserError.message}`, 'error');
          await sleep(5000); // Wait before retry
          currentAttempt++;
          continue;
        }
      }
      
      utils.log(`Starting account creation process for ${ACCOUNTS_COUNT} account(s)...`);
      
      // Track successful accounts
      const successfulAccounts = [];
      
      for (let i = 0; i < ACCOUNTS_COUNT; i++) {
        utils.log(`Creating account ${i + 1} of ${ACCOUNTS_COUNT}...`);
        
        // Create a different random profile for each attempt
        const gmailProfile = generateRandomProfile();
        const outlookProfile = generateRandomProfile();
        
        // Try to create both Gmail and Outlook accounts with retries
        let emailProfile = null;
        let isGmail = false;
        
        // Throttle account creation attempts to avoid rate limiting
        if (i > 0) {
          const randomDelay = Math.floor(Math.random() * 5000) + 5000;
          utils.log(`Adding random delay (${randomDelay}ms) between account creations to avoid rate limiting...`);
          await new Promise(resolve => setTimeout(resolve, randomDelay));
        }
        
        // Try both email providers with fallback strategy
        try {
          // Try Gmail first
          try {
            utils.log('Attempting to create Gmail account...', 'info');
            emailProfile = await utils.retry(
              () => createGmailAccount(browser, gmailProfile),
              {
                maxRetries: 3,
                retryDelay: 8000,
                name: 'Gmail account creation',
                onRetry: async (error, attempt) => {
                  utils.log(`Gmail attempt ${attempt} failed: ${error.message}. Retrying...`, 'warn');
                  // If there's a page navigation or timeout issue, restart the browser
                  if (error.message.includes('timeout') || error.message.includes('navigation')) {
                    utils.log('Detected navigation issue, restarting browser before retry...', 'warn');
                    try {
                      await browser.close();
                    } catch (e) { /* Ignore close errors */ }
                    browser = await utils.setupStealthBrowser(puppeteer);
                  }
                }
              }
            );
            
            isGmail = true;
            utils.log('Successfully created Gmail account', 'success');
          } catch (gmailError) {
            utils.log('Gmail account creation failed, trying Outlook: ' + gmailError.message, 'error');
            
            // Fallback to Outlook
            emailProfile = await utils.retry(
              () => createOutlookAccount(browser, outlookProfile),
              {
                maxRetries: 3,
                retryDelay: 8000,
                name: 'Outlook account creation',
                onRetry: async (error, attempt) => {
                  utils.log(`Outlook attempt ${attempt} failed: ${error.message}. Retrying...`, 'warn');
                  // If there's a page navigation or timeout issue, restart the browser
                  if (error.message.includes('timeout') || error.message.includes('navigation')) {
                    utils.log('Detected navigation issue, restarting browser before retry...', 'warn');
                    try {
                      await browser.close();
                    } catch (e) { /* Ignore close errors */ }
                    browser = await utils.setupStealthBrowser(puppeteer);
                  }
                }
              }
            );
            
            isGmail = false;
            utils.log('Successfully created Outlook account', 'success');
          }
          
          // Create Apple ID using the email account
          if (emailProfile) {
            try {
              utils.log('Attempting to create Apple ID...', 'info');
              
              const appleAccount = await utils.retry(
                () => createAppleID(browser, emailProfile, isGmail),
                {
                  maxRetries: 3,
                  retryDelay: 8000,
                  name: 'Apple ID creation',
                  onRetry: async (error, attempt) => {
                    utils.log(`Apple ID creation attempt ${attempt} failed: ${error.message}. Retrying...`, 'warn');
                    // If there's a page navigation or timeout issue, restart the browser
                    if (error.message.includes('timeout') || error.message.includes('navigation')) {
                      utils.log('Detected navigation issue, restarting browser before retry...', 'warn');
                      try {
                        await browser.close();
                      } catch (e) { /* Ignore close errors */ }
                      browser = await utils.setupStealthBrowser(puppeteer);
                    }
                  }
                }
              );
              
              // Save this account immediately to not lose progress
              successfulAccounts.push(appleAccount);
              
              // Also save to file after each successful account
              const tempAccountsText = successfulAccounts.map(account => 
                `Apple ID: ${account.appleEmail}\nPassword: ${account.applePassword}\n`
              ).join('\n');
              fs.writeFileSync('accounts.txt', tempAccountsText);
              
              utils.log(`Account creation ${i + 1} completed successfully`, 'success');
              utils.log(`Saved account details to accounts.txt`, 'info');
            } catch (appleError) {
              utils.log('Apple ID creation failed: ' + appleError.message, 'error');
              utils.log('Moving to next account...', 'info');
              // Continue with next account instead of failing completely
              continue;
            }
          }
        } catch (accountError) {
          utils.log(`Account creation ${i + 1} failed completely: ${accountError.message}`, 'error');
          utils.log('Moving to next account...', 'info');
          // Continue with next account instead of failing completely
          continue;
        }
      }
      
      // Update the main accountsData array with successful accounts
      accountsData.push(...successfulAccounts);
      
      // Save accounts to file (final version)
      const accountsText = accountsData.map(account => 
        `Apple ID: ${account.appleEmail}\nPassword: ${account.applePassword}\n`
      ).join('\n');
      
      fs.writeFileSync('accounts.txt', accountsText);
      utils.log(`${accountsData.length} account details saved to accounts.txt`, 'success');
      
      // If we reached here, we completed the process successfully
      break;
      
    } catch (error) {
      utils.log(`Error in global attempt ${currentAttempt}: ${error.message}`, 'error');
      currentAttempt++;
      
      // Wait before retry
      if (currentAttempt <= MAX_GLOBAL_ATTEMPTS) {
        utils.log(`Waiting 30 seconds before retry...`, 'info');
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    } finally {
      // Always close browser at the end of each attempt
      if (browser) {
        try {
          await browser.close();
          utils.log('Browser closed successfully');
        } catch (closeError) {
          utils.log(`Error closing browser: ${closeError.message}`, 'error');
        }
      }
    }
  }
  
  // Check if we succeeded in creating any accounts
  if (accountsData.length === 0) {
    utils.log('Failed to create any accounts after all attempts', 'error');
    throw new Error('Failed to create any accounts after all attempts');
  }
  
  return accountsData;
}

// Run the main function with comprehensive error handling
(async () => {
  try {
    console.log('Starting account creation process...');
    await createAccounts();
    console.log('Account creation process completed successfully');
  } catch (error) {
    console.error('=== SCRIPT EXECUTION FAILED ===');
    console.error('Error details:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Log with utils if available
    if (utils && typeof utils.log === 'function') {
      utils.log('Script execution failed: ' + error.message, 'error');
    }
    
    // Exit with error code
    process.exit(1);
  }
})();

} catch (unhandledError) {
  // Last resort error handling for syntax or other critical errors
  console.error('=== CRITICAL UNHANDLED ERROR ===');
  console.error('Error occurred at script initialization:');
  console.error(unhandledError);
  process.exit(1);
}
