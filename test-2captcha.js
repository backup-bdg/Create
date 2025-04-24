console.log('Testing 2captcha import...');
try {
  console.log('Trying standard import...');
  const twoCaptcha = require('2captcha');
  console.log('Import result:', typeof twoCaptcha, Object.keys(twoCaptcha));
  
  console.log('\nTrying destructured import...');
  const { TwoCaptcha } = require('2captcha');
  console.log('Import TwoCaptcha result:', typeof TwoCaptcha);
  
  console.log('\nTrying Solver import...');
  const { Solver } = require('2captcha');
  console.log('Import Solver result:', typeof Solver);
} catch (error) {
  console.error('Import error:', error);
}
