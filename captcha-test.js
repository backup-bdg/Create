try {
  const twoCaptchaModule = require('2captcha');
  console.log('2captcha module structure:', Object.keys(twoCaptchaModule));
  
  if (twoCaptchaModule.TwoCaptcha) {
    console.log('TwoCaptcha exists in module');
  } else if (twoCaptchaModule.Solver) {
    console.log('Solver exists in module');
  } else {
    console.log('Default export type:', typeof twoCaptchaModule);
  }
} catch (e) {
  console.error('Error:', e.message);
}
