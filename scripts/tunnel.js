
require('dotenv').config();
const ngrok = require('ngrok');

const port = process.env.PORT || 3000;
const authtoken = process.env.NGROK_AUTHTOKEN;

if (!authtoken) {
  console.error('ERROR: No NGROK_AUTHTOKEN found in .env file.');
  console.error('Sign up for an account: https://dashboard.ngrok.com/signup');
  console.error('Install your authtoken: https://dashboard.ngrok.com/get-started/your-authtoken');
  process.exit(1);
}

(async () => {
  try {
    console.log(`Connecting to ngrok on port ${port}...`);
    const url = await ngrok.connect({
       addr: parseInt(port),
       authtoken: authtoken,
    });
    console.log('--- NGROK TUNNEL CREATED ---');
    console.log(`Public URL: ${url}`);
    console.log(`Webhook Endpoint: ${url}/webhook/meetstream`);
    console.log('----------------------------');
    console.log('Keep this process running to maintain the tunnel.');
  } catch (err) {
    console.error('Failed to start ngrok:', err.message);
    if (err.body) console.error('Details:', err.body);
    process.exit(1);
  }
})();
