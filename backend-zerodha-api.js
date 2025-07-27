require('dotenv').config();
const express = require('express');
const axios = require('axios');
const session = require('express-session');
const cors = require('cors');
const qs = require('qs'); // npm package to stringify form data
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

const apiKey = process.env.KITE_API_KEY;
const apiSecret = process.env.KITE_API_SECRET;
const redirectUri = process.env.KITE_REDIRECT_URL;  // e.g. https://your-backend-url/api/zerodha/auth/callback

app.use(cors({
  // origin: 'http://localhost:5500',
  origin: 'https://nups.github.io/stockapi/',
  credentials: true
}));
app.use(express.json());

// Use session to store access_token temporarily - for demo only, in production use a DB or Redis
app.use(session({
  secret: 'some-very-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: true,             // must be true for HTTPS
    sameSite: 'none'          // required for cross-origin cookies
  }

}));

// --- Routes ---

// Step 1a: Redirect frontend “Connect Zerodha” button here to start login
app.get('/api/zerodha/auth/login', (req, res) => {
  const loginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}`;
  res.redirect(loginUrl);
});

// Step 1b: OAuth callback to exchange request_token for access_token
app.get('/api/zerodha/auth/callback', async (req, res) => {
  const requestToken = req.query.request_token;
  if (!requestToken) {
    return res.status(400).send('Missing request_token');
  }
  try {
    console.log('API KEY:', process.env.KITE_API_KEY);
    console.log('API SECRET:', process.env.KITE_API_SECRET);
    console.log('Request Token:', requestToken);
    // Compute checksum
    const checksumStr = apiKey + requestToken + apiSecret;
    const checksum = crypto.createHash('sha256').update(checksumStr).digest('hex');
    const data = qs.stringify({
    api_key: apiKey,
    request_token: requestToken,
    api_secret: apiSecret,
    checksum: checksum
    });

    const response = await axios.post('https://api.kite.trade/session/token', data, {
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
    },
    });
    console.log('API KEY:', process.env.KITE_API_KEY);
    // Save access_token in session
    console.log(response);
    req.session.accessToken = response.data.data.access_token;
    // Redirect back to frontend after successful login
    // res.redirect('http://localhost:5500'); // Replace with your frontend URL
    res.redirect('https://nups.github.io/stockapi/');
  } catch (error) {
    console.error('Error exchanging request_token:', error.response?.data || error.message);
    res.status(500).send('Authentication failed');
  }
});

// Step 2: Fetch holdings API
app.get('/api/zerodha/holdings', async (req, res) => {
  const accessToken = req.session.accessToken;
  console.log('Access Token:', accessToken);
  if (!accessToken) {
    return res.status(401).json({ error: 'User not authenticated' });
  }
  try {
    const response = await axios.get('https://api.kite.trade/portfolio/holdings', {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`
      }
    });
    res.json(response.data.data);
    console.log('Holdings fetched successfully:', response.data.data);
  } catch (error) {
    console.error('Error fetching holdings:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch holdings' });
  }
});

app.listen(PORT, () => {
  console.log(`Zerodha backend API listening on port ${PORT}`);
});
