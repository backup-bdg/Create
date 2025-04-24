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

  // Load the Gmail interface
  let gmailInterface;
  try {
    gmailInterface = require('./gmail-interface');
    console.log('Successfully loaded Gmail interface');
  } catch (error) {
    console.error('Error loading Gmail interface:', error.message);
    process.exit(1);
  }

// Configuration
const ACCOUNTS_COUNT = 1; // Number of accounts to create
const APPLE_ID_CREATION_ENABLED = true; // Set to false to skip Apple ID creation

// Helper function to generate a random profile
function generateRandomProfile() {
  const firstName = [
    'John', 'Jane', 'Michael', 'Emily', 'David', 'Sarah', 'Robert', 'Jennifer',
    'William', 'Elizabeth', 'James', 'Linda', 'Richard', 'Patricia', 'Thomas', 'Barbara'
  ][Math.floor(Math.random() * 16)];
  
  const lastName = [
    'Smith', 'Johnson', 'Williams', 'Jones', 'Brown', 'Davis', 'Miller', 'Wilson',
    'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin'
  ][Math.floor(Math.random() * 16)];
  
  // Generate a random string for username
  const randomString = randomBytes(4).toString('hex');
  
  // Generate a random birth date (18-40 years old)
  const currentYear = new Date().getFullYear();
  const age = Math.floor(Math.random() * 22) + 18; // 18-40 years old
  const birthYear = currentYear - age;
  const birthMonth = Math.floor(Math.random() * 12) + 1;
  const birthDay = Math.floor(Math.random() * 28) + 1; // Avoid edge cases with month lengths
  
  // Generate a strong password
  const password = `${randomString}${Math.floor(Math.random() * 1000)}Aa!`;
  
  return {
    firstName,
    lastName,
    username: `${firstName.toLowerCase()}${lastName.toLowerCase()}${randomString}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${randomString}@gmail.com`,
    password,
    birthYear,
    birthMonth,
    birthDay,
    phoneNumber: `555${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`
  };
}

// Helper function for sleeping
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to create an Apple ID using the email account
async function createAppleID(browser, emailProfile) {
  utils.log('Starting Apple ID creation process...', 'info');
  
  const page = await browser.newPage();
  
  try {
    // Set a longer default timeout for navigation
    page.setDefaultNavigationTimeout(60000);
    
    // Navigate to Apple ID creation page
    await page.goto('https://appleid.apple.com/account', { waitUntil: 'networkidle2' });
    
    // Wait for the page to load and check for bot detection
    await sleep(3000);
    const isBotDetected = await screenshotUtils.checkForBotDetection(page);
    if (isBotDetected) {
      await screenshotUtils.captureScreenshot(page, 'apple_bot_detection');
      throw new Error('Bot detection triggered on Apple ID page');
    }
    
    // Fill out the form
    utils.log('Filling out Apple ID creation form...', 'info');
    
    // First name and last name
    await utils.safeInteraction(page, async () => {
      await page.type('#firstName', emailProfile.firstName);
      await utils.humanDelay();
      await page.type('#lastName', emailProfile.lastName);
    }, { selector: '#firstName' });
    
    // Country/Region selection (assuming US by default)
    await utils.safeInteraction(page, async () => {
      await page.click('#countryCode');
      await utils.humanDelay();
      await page.select('#countryCode', 'USA');
    }, { selector: '#countryCode' });
    
    // Birth date
    await utils.safeInteraction(page, async () => {
      await page.type('#birthDay', emailProfile.birthDay.toString());
      await utils.humanDelay();
      await page.type('#birthMonth', emailProfile.birthMonth.toString());
      await utils.humanDelay();
      await page.type('#birthYear', emailProfile.birthYear.toString());
    }, { selector: '#birthDay' });
    
    // Email
    await utils.safeInteraction(page, async () => {
      await page.type('#email', emailProfile.email);
    }, { selector: '#email' });
    
    // Password
    await utils.safeInteraction(page, async () => {
      await page.type('#password', emailProfile.password);
      await utils.humanDelay();
      await page.type('#confirmPassword', emailProfile.password);
    }, { selector: '#password' });
    
    // Phone number (if required)
    const phoneFieldSelector = '#phoneNumber';
    const hasPhoneField = await page.evaluate((selector) => {
      return document.querySelector(selector) !== null;
    }, phoneFieldSelector);
    
    if (hasPhoneField) {
      await utils.safeInteraction(page, async () => {
        await page.type(phoneFieldSelector, emailProfile.phoneNumber);
      }, { selector: phoneFieldSelector });
    }
    
    // Take a screenshot before submitting
    await screenshotUtils.captureScreenshot(page, 'apple_form_filled');
    
    // Submit the form
    utils.log('Submitting Apple ID creation form...', 'info');
    await utils.safeInteraction(page, async () => {
      await Promise.all([
        page.click('#create-account-button'),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
      ]);
    }, { selector: '#create-account-button' });
    
    // Check for success or verification page
    await sleep(5000);
    
    // Take a screenshot after submission
    await screenshotUtils.captureScreenshot(page, 'apple_form_submitted');
    
    // Check for verification code input field
    const verificationCodeSelector = '#verification-code';
    const hasVerificationCode = await page.evaluate((selector) => {
      return document.querySelector(selector) !== null;
    }, verificationCodeSelector);
    
    if (hasVerificationCode) {
      utils.log('Verification code required for Apple ID creation', 'warn');
      throw new Error('Verification code required for Apple ID creation. Manual intervention needed.');
    }
    
    // Check for success indicators
    const successIndicators = [
      'Your Apple ID has been created',
      'Welcome to Apple',
      'account has been created',
      'verification email has been sent'
    ];
    
    const pageContent = await page.content();
    const pageText = await page.evaluate(() => document.body.innerText);
    
    let isSuccess = false;
    for (const indicator of successIndicators) {
      if (pageText.includes(indicator)) {
        isSuccess = true;
        break;
      }
    }
    
    if (!isSuccess) {
      utils.log('Apple ID creation may have failed, checking for error messages...', 'warn');
      
      // Check for common error messages
      const errorIndicators = [
        'already exists',
        'cannot be used',
        'try again',
        'error',
        'invalid'
      ];
      
      let errorFound = false;
      let errorMessage = '';
      
      for (const indicator of errorIndicators) {
        if (pageText.toLowerCase().includes(indicator)) {
          errorFound = true;
          errorMessage = `Error detected: Page contains "${indicator}"`;
          break;
        }
      }
      
      if (errorFound) {
        await screenshotUtils.captureScreenshot(page, 'apple_error');
        throw new Error(`Apple ID creation failed: ${errorMessage}`);
      }
      
      // If no specific error found but also no success indicator, assume it worked
      utils.log('No error detected, assuming Apple ID creation was successful', 'info');
    }
    
    utils.log('Apple ID created successfully', 'success');
    
    // Return the profile information
    return {
      appleEmail: emailProfile.email,
      applePassword: emailProfile.password
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
        
        // Create a random profile for Gmail
        const gmailProfile = generateRandomProfile();
        
        // Throttle account creation attempts to avoid rate limiting
        if (i > 0) {
          const randomDelay = Math.floor(Math.random() * 5000) + 5000;
          utils.log(`Adding random delay (${randomDelay}ms) between account creations to avoid rate limiting...`);
          await new Promise(resolve => setTimeout(resolve, randomDelay));
        }
        
        // Try to create Gmail account using the Python script
        let emailProfile = null;
        
        try {
          utils.log('Attempting to create Gmail account using Python script...', 'info');
          
          // Use the Gmail interface to create accounts
          const gmailAccounts = await utils.retry(
            () => gmailInterface.createGmailAccounts({ accountCount: 1 }),
            {
              maxRetries: 3,
              retryDelay: 8000,
              name: 'Gmail account creation',
              onRetry: async (error, attempt) => {
                utils.log(`Gmail attempt ${attempt} failed: ${error.message}. Retrying...`, 'warn');
              }
            }
          );
          
          if (gmailAccounts && gmailAccounts.length > 0) {
            // Use the first created account
            emailProfile = {
              ...gmailProfile,
              email: gmailAccounts[0].email,
              password: gmailAccounts[0].password
            };
            
            utils.log('Successfully created Gmail account', 'success');
          } else {
            throw new Error('No Gmail accounts were created');
          }
        } catch (gmailError) {
          utils.log('Gmail account creation failed: ' + gmailError.message, 'error');
          utils.log('Moving to next account...', 'info');
          continue; // Skip to next account since we no longer have Outlook fallback
        }
        
        // Create Apple ID using the email account if enabled
        if (emailProfile && APPLE_ID_CREATION_ENABLED) {
          try {
            utils.log('Attempting to create Apple ID...', 'info');
            
            const appleAccount = await utils.retry(
              () => createAppleID(browser, emailProfile),
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
        } else if (emailProfile) {
          // If Apple ID creation is disabled, just save the email account
          successfulAccounts.push({
            appleEmail: emailProfile.email,
            applePassword: emailProfile.password
          });
          
          // Save to file after each successful account
          const tempAccountsText = successfulAccounts.map(account => 
            `Email: ${account.appleEmail}\nPassword: ${account.applePassword}\n`
          ).join('\n');
          fs.writeFileSync('accounts.txt', tempAccountsText);
          
          utils.log(`Email account ${i + 1} created successfully`, 'success');
          utils.log(`Saved account details to accounts.txt`, 'info');
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
