const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { log, retry } = require('./utils');

/**
 * Interface to run the Python Gmail creator script
 * @param {Object} options - Configuration options
 * @param {number} options.accountCount - Number of accounts to create
 * @param {string} options.outputFile - Path to the output file (default: 'created.txt')
 * @returns {Promise<Array<{email: string, password: string}>>} - Array of created accounts
 */
async function createGmailAccounts(options = {}) {
  const { 
    accountCount = 1,
    outputFile = path.join(__dirname, 'created.txt')
  } = options;
  
  // Make sure the output file doesn't exist before starting
  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile);
  }
  
  // Path to the Python script
  const scriptPath = path.join(__dirname, 'Gmail', 'gmail-creator.py');
  
  // Check if the script exists
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Gmail creator script not found at ${scriptPath}`);
  }
  
  log('Starting Gmail account creation using Python script...', 'info');
  
  // Install required Python dependencies first
  log('Installing required Python dependencies...', 'info');
  try {
    const requirementsPath = path.join(__dirname, 'Gmail', 'requirements.txt');
    await new Promise((resolve, reject) => {
      // Use pip3 explicitly to ensure Python 3 is used
      const pipProcess = spawn('pip3', ['install', '-r', requirementsPath]);
      
      pipProcess.stdout.on('data', (data) => {
        log(`Pip output: ${data.toString().trim()}`, 'info');
      });
      
      pipProcess.stderr.on('data', (data) => {
        const errorText = data.toString().trim();
        // Only log as warning if it's not a critical error
        if (errorText.includes('WARNING') || errorText.includes('DEPRECATION')) {
          log(`Pip warning: ${errorText}`, 'warn');
        } else {
          log(`Pip error: ${errorText}`, 'error');
        }
      });
      
      pipProcess.on('close', (code) => {
        if (code !== 0) {
          log(`Pip process exited with code ${code}`, 'error');
          reject(new Error(`Failed to install Python dependencies with code ${code}`));
        } else {
          log('Python dependencies installed successfully', 'success');
          resolve();
        }
      });
      
      pipProcess.on('error', (error) => {
        log(`Error spawning pip process: ${error.message}`, 'error');
        reject(new Error(`Failed to start pip: ${error.message}`));
      });
    });
  } catch (error) {
    log(`Failed to install Python dependencies: ${error.message}`, 'error');
    throw new Error(`Failed to install Python dependencies: ${error.message}`);
  }
  
  // Create a modified version of the script with the account count
  log(`Creating temporary script with ${accountCount} accounts...`, 'info');
  const originalScript = fs.readFileSync(scriptPath, 'utf8');
  
  // Update the config in the script to match the requested account count
  const modifiedScript = originalScript.replace(
    /\'account_count\'\s*:\s*\d+/,
    `'account_count': ${accountCount}`
  );
  
  // Write the modified script to a temporary file
  const tempScriptPath = path.join(__dirname, 'Gmail', 'temp-gmail-creator.py');
  fs.writeFileSync(tempScriptPath, modifiedScript);
  
  return new Promise((resolve, reject) => {
    // Spawn the Python process
    log('Running Python script...', 'info');
    // Use python3 explicitly to ensure Python 3 is used
    const pythonProcess = spawn('python3', [tempScriptPath]);
    
    let stdoutData = '';
    let stderrData = '';
    
    // Collect stdout data
    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdoutData += output;
      log(`Python script output: ${output.trim()}`, 'info');
      
      // Check for error indicators in the output and stop the process if found
      if (output.includes("Exiting script due to error") || 
          output.includes("Exiting script due to TimeoutException") ||
          output.includes("Error finding username field")) {
        log('Critical error detected in Python script output. Stopping the process.', 'error');
        pythonProcess.kill(); // Kill the process
        reject(new Error(`Gmail account creation failed: ${output}`));
      }
    });
    
    // Collect stderr data
    pythonProcess.stderr.on('data', (data) => {
      const error = data.toString();
      stderrData += error;
      log(`Python script error: ${error.trim()}`, 'error');
      
      // Always stop on stderr output
      log('Error detected in Python script. Stopping the process.', 'error');
      pythonProcess.kill(); // Kill the process
      reject(new Error(`Gmail account creation failed: ${error}`));
    });
    
    // Handle process completion
    pythonProcess.on('close', (code) => {
      // Clean up the temporary script
      if (fs.existsSync(tempScriptPath)) {
        try {
          fs.unlinkSync(tempScriptPath);
          log('Temporary script cleaned up', 'info');
        } catch (e) {
          log(`Failed to clean up temporary script: ${e.message}`, 'warn');
        }
      }
      
      if (code !== 0) {
        log(`Python process exited with code ${code}`, 'error');
        return reject(new Error(`Gmail account creation failed with code ${code}: ${stderrData}`));
      }
      
      log('Python Gmail creator completed successfully', 'success');
      
      // Check if the output file exists
      if (!fs.existsSync(outputFile)) {
        return reject(new Error('Gmail account creation did not produce any output file'));
      }
      
      // Read and parse the output file
      try {
        const fileContent = fs.readFileSync(outputFile, 'utf8');
        const accounts = parseCreatedAccounts(fileContent);
        
        if (accounts.length === 0) {
          return reject(new Error('No Gmail accounts were created'));
        }
        
        log(`Successfully created ${accounts.length} Gmail accounts`, 'success');
        resolve(accounts);
      } catch (error) {
        reject(new Error(`Failed to parse Gmail accounts: ${error.message}`));
      }
    });
    
    // Handle process errors
    pythonProcess.on('error', (error) => {
      log(`Error spawning Python process: ${error.message}`, 'error');
      reject(new Error(`Failed to start Gmail creator: ${error.message}`));
    });
  });
}

/**
 * Parse the created.txt file to extract account information
 * @param {string} fileContent - Content of the created.txt file
 * @returns {Array<{email: string, password: string}>} - Array of created accounts
 */
function parseCreatedAccounts(fileContent) {
  const accounts = [];
  const lines = fileContent.split('\n');
  
  for (let i = 0; i < lines.length; i += 3) {
    const usernameLine = lines[i];
    const passwordLine = lines[i + 1];
    
    if (usernameLine && passwordLine) {
      const username = usernameLine.replace('Username: ', '').trim();
      const password = passwordLine.replace('Password: ', '').trim();
      
      if (username && password) {
        accounts.push({
          email: `${username}@gmail.com`,
          password
        });
      }
    }
  }
  
  return accounts;
}

module.exports = {
  createGmailAccounts
};
