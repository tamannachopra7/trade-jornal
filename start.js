// start.js
// This script starts the Next.js server and also runs a ping bot to keep the Render service awake.

// 1. Start the ping bot
// If Render doesn't automatically set the URL, it will fall back to this placeholder
const url = process.env.RENDER_EXTERNAL_URL || 'https://<YOUR_APP_NAME_HERE>.onrender.com';
const interval = 5 * 60 * 1000; // 5 minutes

console.log(`[Ping Bot] Starting ping bot. Target URL: ${url}`);

setInterval(() => {
  fetch(url)
    .then(res => console.log(`[Ping Bot] Successfully pinged ${url} - Status: ${res.status}`))
    .catch(err => console.error(`[Ping Bot] Ping failed:`, err.message));
}, interval);

// 2. Start the main Next.js server
require('./apps/web/server.js');
