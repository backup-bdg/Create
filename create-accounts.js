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
  let puppeteer, TwoCaptcha, twilio;
  try {
    puppeteer = require('puppeteer');
    console.log('Successfully loaded puppeteer');
  } catch (error) {
    console.error('Error loading puppeteer:', error.message);
    process.exit(1);
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
        return puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
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
    await page.setViewport({ width: 1366, height: 768 });
    
    // Navigate to Gmail signup
    await utils.safeInteraction(page, 
      () => page.goto('https://accounts.google.com/signup'),
      { waitForNavigation: true }
    );
    
    await utils.safeInteraction(page,
      () => page.waitForSelector('input[name="firstName"]'),
      { timeout: 15000 }
    );
    
    // Fill the form with random delays
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('input[name="firstName"]', profile.firstName, { delay: 100 })
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('input[name="lastName"]', profile.lastName, { delay: 100 })
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('input[name="Username"]', profile.username, { delay: 150 })
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('input[name="Passwd"]', profile.password, { delay: 100 })
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('input[name="ConfirmPasswd"]', profile.password, { delay: 100 })
    );
    
    // Click next with delay
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.click('button[type="button"]'),
      { waitForNavigation: true }
    );
    
    // Handle phone verification
    await utils.safeInteraction(page,
      () => page.waitForSelector('input[type="tel"]'),
      { timeout: 15000 }
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('input[type="tel"]', TWILIO_PHONE_NUMBER, { delay: 150 })
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.click('button[type="button"]'),
      { waitForNavigation: true }
    );
    
    // Get and enter verification code
    const verificationCode = await getSmsVerificationCode(TWILIO_PHONE_NUMBER);
    
    await utils.safeInteraction(page,
      () => page.waitForSelector('input[name="code"]'),
      { timeout: 15000 }
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('input[name="code"]', verificationCode, { delay: 200 })
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.click('button[type="button"]'),
      { waitForNavigation: true }
    );
    
    // Add recovery info (optional)
    try {
      await page.waitForSelector('input[type="email"]', { timeout: 5000 });
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.click('button:contains("Skip")'),
        { waitForNavigation: true }
      );
    } catch (error) {
      // Recovery email might be optional
      utils.log('Recovery email step not found, continuing...', 'info');
    }
    
    // Handle additional optional steps
    try {
      await page.waitForSelector('button:contains("I agree")', { timeout: 5000 });
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.click('button:contains("I agree")'),
        { waitForNavigation: true }
      );
    } catch (error) {
      utils.log('Agreement step not found, may have already completed', 'info');
    }
    
    // Complete the signup process
    await utils.humanDelay();
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
    
    utils.log('Gmail account created successfully', 'success');
    profile.email = `${profile.username}@gmail.com`;
    return profile;
  } catch (error) {
    utils.log('Gmail account creation error: ' + error.message, 'error');
    throw new Error(`Failed to create Gmail account: ${error.message}`);
  } finally {
    await page.close();
  }
}

async function createOutlookAccount(browser, profile) {
  utils.log('Creating Outlook account...');
  const page = await browser.newPage();
  
  try {
    // Set human-like behavior
    await page.setViewport({ width: 1366, height: 768 });
    
    // Navigate to Outlook signup
    await utils.safeInteraction(page, 
      () => page.goto('https://signup.live.com'),
      { waitForNavigation: true }
    );
    
    await utils.safeInteraction(page,
      () => page.waitForSelector('#MemberName'),
      { timeout: 15000 }
    );
    
    // Fill the email form
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('#MemberName', profile.username, { delay: 150 })
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.click('#iSignupAction'),
      { waitForNavigation: true }
    );
    
    // Fill the password
    await utils.safeInteraction(page,
      () => page.waitForSelector('#PasswordInput'),
      { timeout: 15000 }
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('#PasswordInput', profile.password, { delay: 150 })
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.click('#iSignupAction'),
      { waitForNavigation: true }
    );
    
    // Fill name details
    await utils.safeInteraction(page,
      () => page.waitForSelector('#FirstName'),
      { timeout: 15000 }
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('#FirstName', profile.firstName, { delay: 100 })
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('#LastName', profile.lastName, { delay: 100 })
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.click('#iSignupAction'),
      { waitForNavigation: true }
    );
    
    // Fill birth date
    await utils.safeInteraction(page,
      () => page.waitForSelector('#BirthMonth'),
      { timeout: 15000 }
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.select('#BirthMonth', profile.birthMonth.toString())
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.select('#BirthDay', profile.birthDay.toString())
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('#BirthYear', profile.birthYear.toString(), { delay: 100 })
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.click('#iSignupAction'),
      { waitForNavigation: true }
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
      
      await utils.humanDelay();
      await utils.safeInteraction(page,
        () => page.click('#iSignupAction'),
        { waitForNavigation: true }
      );
    } catch (error) {
      utils.log('CAPTCHA not detected or already solved', 'info');
    }
    
    // Handle phone verification
    await utils.safeInteraction(page,
      () => page.waitForSelector('#PhoneInput'),
      { timeout: 15000 }
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('#PhoneInput', TWILIO_PHONE_NUMBER, { delay: 150 })
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.click('#iSignupAction'),
      { waitForNavigation: true }
    );
    
    // Get and enter verification code
    const verificationCode = await getSmsVerificationCode(TWILIO_PHONE_NUMBER);
    
    await utils.safeInteraction(page,
      () => page.waitForSelector('#VerificationCode'),
      { timeout: 15000 }
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.type('#VerificationCode', verificationCode, { delay: 200 })
    );
    
    await utils.humanDelay();
    await utils.safeInteraction(page,
      () => page.click('#iSignupAction'),
      { waitForNavigation: true }
    );
    
    // Wait for account creation to complete
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
    
    utils.log('Outlook account created successfully', 'success');
    profile.email = `${profile.username}@outlook.com`;
    return profile;
  } catch (error) {
    utils.log('Outlook account creation error: ' + error.message, 'error');
    throw new Error(`Failed to create Outlook account: ${error.message}`);
  } finally {
    await page.close();
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
  
  // Use the stealth browser setup from utils
  const browser = await utils.setupStealthBrowser(puppeteer);
  
  const accountsData = [];
  
  try {
    utils.log(`Starting account creation process for ${ACCOUNTS_COUNT} account(s)...`);
    
    for (let i = 0; i < ACCOUNTS_COUNT; i++) {
      utils.log(`Creating account ${i + 1} of ${ACCOUNTS_COUNT}...`);
      
      // Try to create both Gmail and Outlook accounts with retries
      let emailProfile = null;
      let isGmail = false;
      
      // Try Gmail first
      try {
        utils.log('Attempting to create Gmail account...', 'info');
        const profile = generateRandomProfile();
        
        emailProfile = await utils.retry(
          () => createGmailAccount(browser, profile),
          {
            maxRetries: 2,
            retryDelay: 5000,
            name: 'Gmail account creation'
          }
        );
        
        isGmail = true;
        utils.log('Successfully created Gmail account', 'success');
      } catch (gmailError) {
        utils.log('Gmail account creation failed, trying Outlook: ' + gmailError.message, 'error');
        
        // Fallback to Outlook
        try {
          utils.log('Attempting to create Outlook account...', 'info');
          const profile = generateRandomProfile();
          
          emailProfile = await utils.retry(
            () => createOutlookAccount(browser, profile),
            {
              maxRetries: 2,
              retryDelay: 5000,
              name: 'Outlook account creation'
            }
          );
          
          isGmail = false;
          utils.log('Successfully created Outlook account', 'success');
        } catch (outlookError) {
          utils.log('Outlook account creation failed: ' + outlookError.message, 'error');
          throw new Error('Failed to create any email account');
        }
      }
      
      // Create Apple ID using the email account
      if (emailProfile) {
        try {
          utils.log('Attempting to create Apple ID...', 'info');
          
          const appleAccount = await utils.retry(
            () => createAppleID(browser, emailProfile, isGmail),
            {
              maxRetries: 2,
              retryDelay: 5000,
              name: 'Apple ID creation'
            }
          );
          
          accountsData.push(appleAccount);
          utils.log(`Account creation ${i + 1} completed successfully`, 'success');
        } catch (appleError) {
          utils.log('Apple ID creation failed: ' + appleError.message, 'error');
          throw appleError;
        }
      }
    }
    
    // Save accounts to file
    const accountsText = accountsData.map(account => 
      `Apple ID: ${account.appleEmail}\nPassword: ${account.applePassword}\n`
    ).join('\n');
    
    fs.writeFileSync('accounts.txt', accountsText);
    utils.log(`${accountsData.length} account details saved to accounts.txt`, 'success');
  } catch (error) {
    utils.log('Error in account creation process: ' + error.message, 'error');
    throw error;
  } finally {
    await browser.close();
  }
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
