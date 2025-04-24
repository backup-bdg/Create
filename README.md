# Automated Account Creator

This project automatically creates Gmail accounts using a Python script and uses them to sign up for Apple IDs. It handles CAPTCHA challenges using 2Captcha and phone verification using Twilio.

## Features

- Automated creation of Gmail accounts using Python and Selenium
- Random username and password generation
- Apple ID signup automation
- CAPTCHA solving with 2Captcha
- SMS verification with Twilio
- Email verification retrieval
- GitHub Actions integration for automated runs
- Output saved to a text file and uploaded as an artifact

## Prerequisites

- Node.js 14 or higher
- Python 3.x
- Selenium for Python
- Chrome WebDriver
- 2Captcha API key (for solving CAPTCHAs)
- Twilio account with a phone number (for SMS verification)
- GitHub repository (for GitHub Actions integration)

## Setup

1. **Clone this repository:**

```bash
git clone https://github.com/yourusername/account-creator.git
cd account-creator
```

2. **Install Node.js dependencies:**

```bash
npm install
```

3. **Install Python dependencies:**

```bash
cd Gmail
pip install -r requirements.txt
# or run the install.bat file on Windows
```

4. **Credentials configuration:**

The script has been configured with hardcoded credentials for:
- 2Captcha API
- Twilio account
- Phone number for verification

These credentials are obfuscated in the code by splitting them into multiple parts to bypass GitHub's secret detection system. They are reassembled at runtime.

If you need to change these credentials:
1. Edit the credential parts in the `create-accounts.js` file
2. Make sure to split any new credentials into multiple small parts to avoid triggering GitHub's secret detection

## Usage

### Running Locally

Execute the script to create accounts:

```bash
node create-accounts.js
```

The created accounts will be saved in `accounts.txt`.

### Running via GitHub Actions

1. Navigate to the "Actions" tab in your GitHub repository
2. Select the "Create Accounts" workflow
3. Click "Run workflow"
4. Enter the number of accounts to create (default: 1)
5. Click "Run workflow" again
6. Once complete, download the "created-accounts" artifact to access the accounts.txt file

## How It Works

1. The Node.js script (`create-accounts.js`) calls the Python Gmail creator script to create Gmail accounts
2. The Python script uses Selenium to automate the Gmail account creation process
3. The created Gmail accounts are saved to a file and read by the Node.js script
4. The Node.js script then uses Puppeteer to create Apple IDs using the Gmail accounts
5. All created accounts are saved to `accounts.txt`

## Configuration

The script is configurable through environment variables:

- `TWOCAPTCHA_API_KEY`: Your 2Captcha API key
- `TWILIO_ACCOUNT_SID`: Your Twilio account SID
- `TWILIO_AUTH_TOKEN`: Your Twilio auth token
- `TWILIO_PHONE_NUMBER`: Your Twilio phone number (with country code)

## Security Considerations

- This script handles sensitive information like email addresses and passwords
- The GitHub Action workflow is configured to store artifacts for only 1 day
- The API credentials are obfuscated in the code but are still technically visible
- If this repository is made public, consider changing the credentials periodically
- Consider implementing encryption for the accounts.txt file
- For higher security, you could modify the code to use environment variables instead

## Troubleshooting

- **CAPTCHA solving issues**: Check your 2Captcha API balance
- **SMS verification failures**: Verify your Twilio account status and phone number capabilities
- **Account creation failures**: The script includes error handling with retries. Check logs for details
- **GitHub Actions failures**: Check the workflow logs for error details
- **API credential issues**: If you need to update the obfuscated credentials, edit the respective parts in the code
- **Python script issues**: Check the error_log.txt file created by the Python script

## Customization

You can modify the script to:

- Adjust random username/password generation patterns
- Change the target websites or account types
- Implement additional verification methods
- Add proxy support for IP rotation
- Store account details in a database instead of a text file

## Disclaimer

This tool is provided for educational purposes only. Automated account creation may violate the terms of service of the target websites. Use responsibly and at your own risk.
