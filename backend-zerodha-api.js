require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const qs = require('qs'); // npm package to stringify form data
const crypto = require('crypto');
const redis = require('redis');

const app = express();
const PORT = process.env.PORT || 3001;

const apiKey = process.env.KITE_API_KEY;
const apiSecret = process.env.KITE_API_SECRET;
const redirectUri = process.env.KITE_REDIRECT_URL;  // e.g. https://your-backend-url/api/zerodha/auth/callback

// Redis client setup
const redisConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379'
};

// Add password if provided (for Azure Redis Cache or other secured Redis instances)
if (process.env.REDIS_PASSWORD) {
  redisConfig.password = process.env.REDIS_PASSWORD;
}

// For Azure Redis Cache, enable TLS
if (process.env.REDIS_URL && process.env.REDIS_URL.includes('redis.cache.windows.net')) {
  redisConfig.socket = {
    tls: true,
    rejectUnauthorized: false
  };
}

const redisClient = redis.createClient(redisConfig);

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

// Connect to Redis with error handling
redisClient.connect().catch(err => {
  console.error('Failed to connect to Redis:', err);
  process.exit(1);
});

app.use(cors({
  origin: [
    'https://nups.github.io',
    'https://nups.github.io/stockapi',
    'http://localhost:5500' // for local development
  ],
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check Redis connection
    await redisClient.ping();
    res.status(200).json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      redis: 'connected'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      redis: 'disconnected',
      error: error.message
    });
  }
});

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
    console.log('API SECRET:', process.env.KITE_API_SECRET ? 'Present' : 'Missing');
    console.log('Request Token:', requestToken);
    
    // Validate required parameters
    if (!apiKey || !apiSecret) {
      throw new Error('API key or secret is missing');
    }
    
    // Compute checksum
    const checksumStr = apiKey + requestToken + apiSecret;
    const checksum = crypto.createHash('sha256').update(checksumStr).digest('hex');
    console.log('Checksum string length:', checksumStr.length);
    console.log('Generated checksum:', checksum);
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
    
    // Get user info and store access_token in Redis
    const accessToken = response.data.data.access_token;
    const userId = response.data.data.user_id;
    
    // Generate a session token for the frontend
    const sessionToken = crypto.randomBytes(32).toString('hex');
    
    // Store access token in Redis with session token as key (expires in 6 hours)
    await redisClient.setEx(`session:${sessionToken}`, 21600, JSON.stringify({
      access_token: accessToken,
      user_id: userId
    }));
    
    console.log(`Access token stored for user: ${userId} with session: ${sessionToken}`);
    
    // Redirect back to frontend with session token
    res.redirect(`https://nups.github.io/stockapi/?session=${sessionToken}`);
  } catch (error) {
    console.error('Error exchanging request_token:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    
    if (error.response?.status === 409) {
      res.status(409).send('Request token already used or expired. Please try logging in again.');
    } else if (error.response?.status === 403) {
      res.status(403).send('Invalid API credentials or checksum. Please check your API key and secret.');
    } else {
      res.status(500).send('Authentication failed');
    }
  }
});

// Step 2: Fetch holdings API
app.get('/api/zerodha/holdings', async (req, res) => {
  const sessionToken = req.query.session;
  
  if (!sessionToken) {
    return res.status(400).json({ error: 'Session token is required' });
  }
  
  try {
    // Get session data from Redis
    const sessionData = await redisClient.get(`session:${sessionToken}`);
    console.log('Session data:', sessionData ? 'Found' : 'Not found');
    
    if (!sessionData) {
      return res.status(401).json({ error: 'Session expired or invalid. Please re-authenticate.' });
    }
    
    const { access_token: accessToken, user_id: userId } = JSON.parse(sessionData);
    
    const response = await axios.get('https://api.kite.trade/portfolio/holdings', {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`
      }
    });
    res.json(response.data.data);
    console.log('Holdings fetched successfully for user:', userId);
  } catch (error) {
    console.error('Error fetching holdings:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    
    if (error.response?.status === 403) {
      res.status(403).json({ error: 'Invalid or expired access token. Please re-authenticate.' });
    } else if (error.response?.status === 409) {
      res.status(409).json({ error: 'API rate limit or conflict. Please try again later.' });
    } else {
      res.status(500).json({ error: 'Failed to fetch holdings' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Zerodha backend API listening on port ${PORT}`);
});

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await redisClient.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await redisClient.quit();
  process.exit(0);
});
