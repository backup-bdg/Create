# Automated Account Creator

This project automatically creates email accounts (Gmail or Outlook) and uses them to sign up for Apple IDs. It handles CAPTCHA challenges using 2Captcha and phone verification using Twilio.

## Features

- Automated creation of Gmail or Outlook accounts
- Random username and password generation
- Apple ID signup automation
- CAPTCHA solving with 2Captcha
- SMS verification with Twilio
- Email verification retrieval
- GitHub Actions integration for automated runs
- Output saved to a text file and uploaded as an artifact

## Prerequisites

- Node.js 14 or higher
- 2Captcha API key (for solving CAPTCHAs)
- Twilio account with a phone number (for SMS verification)
- GitHub repository (for GitHub Actions integration)

## Setup

1. **Clone this repository:**

```bash
git clone https://github.com/yourusername/account-creator.git
cd account-creator
```

2. **Install dependencies:**

```bash
npm install
```

3. **Configure environment variables:**

For local execution, create a `.env` file with the following variables:

```
TWOCAPTCHA_API_KEY=your_2captcha_api_key
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number_with_country_code
```

For GitHub Actions, add these same variables as repository secrets.

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

## Configuration

The script is configurable through environment variables:

- `TWOCAPTCHA_API_KEY`: Your 2Captcha API key
- `TWILIO_ACCOUNT_SID`: Your Twilio account SID
- `TWILIO_AUTH_TOKEN`: Your Twilio auth token
- `TWILIO_PHONE_NUMBER`: Your Twilio phone number (with country code)

## Security Considerations

- This script handles sensitive information like email addresses and passwords
- The GitHub Action workflow is configured to store artifacts for only 1 day
- Never commit your API keys or secrets to the repository
- Use GitHub Secrets for sensitive information
- Consider implementing encryption for the accounts.txt file

## Troubleshooting

- **CAPTCHA solving issues**: Check your 2Captcha API balance and ensure the API key is correct
- **SMS verification failures**: Verify your Twilio account status and phone number capabilities
- **Account creation failures**: The script includes error handling with retries. Check logs for details
- **GitHub Actions failures**: Check the workflow logs for error details

## Customization

You can modify the script to:

- Adjust random username/password generation patterns
- Change the target websites or account types
- Implement additional verification methods
- Add proxy support for IP rotation
- Store account details in a database instead of a text file

## Disclaimer

This tool is provided for educational purposes only. Automated account creation may violate the terms of service of the target websites. Use responsibly and at your own risk.
