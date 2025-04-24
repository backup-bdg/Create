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
  
  // Modify the Python script to create the specified number of accounts
  const originalScript = fs.readFileSync(scriptPath, 'utf8');
  const modifiedScript = originalScript.replace(
    /for _ in range\(5\): # Change/,
    `for _ in range(${accountCount}): # Modified by Node.js interface`
  );
  
  // Write the modified script to a temporary file
  const tempScriptPath = path.join(__dirname, 'Gmail', 'temp-gmail-creator.py');
  fs.writeFileSync(tempScriptPath, modifiedScript);
  
  return new Promise((resolve, reject) => {
    // Spawn the Python process
    const pythonProcess = spawn('python', [tempScriptPath]);
    
    let stdoutData = '';
    let stderrData = '';
    
    // Collect stdout data
    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdoutData += output;
      log(`Python script output: ${output.trim()}`, 'info');
    });
    
    // Collect stderr data
    pythonProcess.stderr.on('data', (data) => {
      const error = data.toString();
      stderrData += error;
      log(`Python script error: ${error.trim()}`, 'error');
    });
    
    // Handle process completion
    pythonProcess.on('close', (code) => {
      // Clean up the temporary script
      if (fs.existsSync(tempScriptPath)) {
        fs.unlinkSync(tempScriptPath);
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
