const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { TwoCaptcha } = require('2captcha');
const twilio = require('twilio');
const { randomBytes } = require('crypto');
const { setTimeout } = require('timers/promises');
const utils = require('./utils');

// Configuration (in a real scenario, these would be stored as GitHub secrets)
const TWOCAPTCHA_API_KEY = process.env.TWOCAPTCHA_API_KEY || '';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';

// Number of accounts to create (defaults to 1)
const ACCOUNTS_COUNT = parseInt(process.env.ACCOUNTS_COUNT || '1', 10);

// Initialize APIs
const solver = new TwoCaptcha(TWOCAPTCHA_API_KEY);
const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

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
      const result = await solver.recaptcha({
        sitekey,
        url,
        invisible: 1,
        enterprise: 0
      });
      
      utils.log('CAPTCHA solved: ' + result.data.substring(0, 15) + '...');
      return result.data;
    } catch (error) {
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

// Run the main function
(async () => {
  try {
    await createAccounts();
  } catch (error) {
    utils.log('Script execution failed: ' + error.message, 'error');
    process.exit(1);
  }
})();
