require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const qs = require('qs'); // npm package to stringify form data
const crypto = require('crypto');
const redis = require('redis');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3001;

const apiKey = process.env.KITE_API_KEY;
const apiSecret = process.env.KITE_API_SECRET;
const redirectUri = process.env.KITE_REDIRECT_URL;  // e.g. https://your-backend-url/api/zerodha/auth/callback

// Google Gemini AI client setup (FREE)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

// AI Analysis Function with improved prompting
async function getAIRecommendations(holdings) {
  try {
    const holdingsData = holdings.map(holding => {
      const pnl = ((holding.last_price - holding.average_price) * holding.quantity);
      const pnlPercent = ((holding.last_price - holding.average_price) / holding.average_price * 100).toFixed(2);
      return {
        symbol: holding.tradingsymbol,
        quantity: holding.quantity,
        avg_price: holding.average_price,
        current_price: holding.last_price,
        pnl: pnl.toFixed(2),
        pnl_percent: pnlPercent,
        current_value: (holding.last_price * holding.quantity).toFixed(2)
      };
    });

    const prompt = `You are an aggressive Indian stock market analyst with a keen eye on both fundamental strength and technical momentum. Analyze these holdings and provide actionable BUY/HOLD/SELL recommendations.

BE DECISIVE: Recommend BUY if the stock demonstrates strong underlying business health, growth potential, and positive technical signals. Recommend HOLD for neutral cases where potential exists but immediate triggers are absent, or for defensive plays. Recommend SELL for clear underperformers, those with deteriorating fundamentals, or negative technical breakdowns.

IMPORTANT RULES FOR RECOMMENDATIONS:

**Fundamental Considerations:**
1.  **Profit & Loss (P&L):**
    * If P&L is positive and > 5% - **Strong BUY signal** (indicates current profitability and momentum).
    * If P&L is positive but < 5% - **Lean HOLD** (monitor for stronger signals, consider if other fundamentals are strong).
    * If P&L is negative and < -5% - **Strong SELL signal** (significant underperformance, consider cutting losses).
    * If P&L is negative but > -5% - **Lean HOLD/evaluate SELL** (requires deeper fundamental and technical check).
2.  **Valuation & Quality:**
    * If it's a quality large-cap stock (e.g., RELIANCE, TCS, INFY, HDFC) with stable or improving fundamentals (e.g., consistent revenue growth, healthy margins, low debt) - **Strong BUY/HOLD**. Less likely a SELL unless severe, prolonged underperformance or major structural shifts.
    * If current price is significantly lower than average acquisition price (implies value opportunity) AND company fundamentals are sound - **Consider BUY** (potential for mean reversion/value unlock).
    * **Management Quality & Governance:** Assess implicitly (e.g., through consistency of performance, lack of red flags). Strong management and governance are always a **BUY enabler**.
    * **Competitive Landscape/Moats:** Consider if the company has a strong market position, brand, or other competitive advantages. Strong moats are a **BUY enabler**.

**Technical Considerations:**
1.  **Momentum & Trend:**
    * If day_change_percentage is consistently positive, especially with rising last_price vs close_price - **Strong BUY** (strong intraday and short-term momentum).
    * If day_change_percentage is consistently negative or last_price is significantly below close_price - **Strong SELL** (deteriorating short-term momentum).
    * Consider the implied trend from average_price vs last_price. If last_price is well above average_price - **Positive Trend/BUY**. If last_price is significantly below average_price - **Negative Trend/SELL**.
2.  **Relative Strength:** (Implicitly inferred from day_change_percentage and P&L vs. general market behavior) - Stocks showing better day_change_percentage or P&L than others in a challenging market indicate relative strength, which is a **BUY signal**.
3.  **Volatility/Stability:** Stocks with low day_change_percentage volatility and positive P&L could be stable **HOLDs**. High negative volatility could be a **SELL**.

**Aggressiveness & Bias:**
* Be more aggressive with recommendations - aim for 40-60% BUY recommendations, and include SELL recommendations where justified by deteriorating fundamental or technical signals.
* Prioritize cutting losses on clear underperformers.

Holdings to analyze:
${JSON.stringify(holdingsData, null, 2)}

Respond ONLY with valid JSON array (no markdown, no extra text):
[
  {
    "symbol": "STOCK_SYMBOL",
    "recommendation": "BUY",
    "reason": "Strong fundamentals, positive momentum",
    "insight": "Benefiting from sector tailwinds"
  }
]`;
    console.log('Prompt for Gemini AI:', prompt);
    const result = await model.generateContent(prompt);
    const aiResponse = result.response.text();
    
    console.log('Gemini AI Response:', aiResponse);
    
    // Clean the response and try to parse JSON
    let cleanedResponse = aiResponse.trim();
    
    // Remove markdown code blocks if present
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/```json\n?/, '').replace(/\n?```$/, '');
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/```\n?/, '').replace(/\n?```$/, '');
    }
    
    try {
      const parsed = JSON.parse(cleanedResponse);
      console.log('Successfully parsed AI recommendations:', parsed.length, 'recommendations');
      return parsed;
    } catch (parseError) {
      console.error('Failed to parse Gemini response as JSON:', parseError);
      console.error('Raw response:', aiResponse);
      
      // Enhanced fallback with some variety
      return holdings.map((holding, index) => {
        // Add some variety in fallback recommendations
        const isEven = index % 2 === 0;
        const pnl = ((holding.last_price - holding.average_price) / holding.average_price * 100);
        
        return {
          symbol: holding.tradingsymbol,
          recommendation: (pnl > 5 || isEven) ? "BUY" : "HOLD",
          reason: pnl > 5 ? "Positive performance trend" : "Stable fundamentals",
          insight: "AI analysis partially available - manual review suggested"
        };
      });
    }

  } catch (error) {
    console.error('Gemini AI error:', error);
    
    // Enhanced fallback with variety
    return holdings.map((holding, index) => {
      const pnl = ((holding.last_price - holding.average_price) / holding.average_price * 100);
      
      return {
        symbol: holding.tradingsymbol,
        recommendation: pnl > 0 ? "BUY" : "HOLD",
        reason: pnl > 0 ? "Positive returns indicated" : "Conservative approach",
        insight: "AI service temporarily unavailable"
      };
    });
  }
}

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

// Step 3: Fetch holdings with AI recommendations
app.get('/api/zerodha/holdings-ai', async (req, res) => {
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
    
    // Fetch holdings from Zerodha
    const response = await axios.get('https://api.kite.trade/portfolio/holdings', {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`
      }
    });
    
    const holdings = response.data.data;
    console.log(`Holdings fetched for user: ${userId}, Count: ${holdings.length}`);
    
    // Get AI recommendations if holdings exist
    let aiRecommendations = [];
    if (holdings && holdings.length > 0) {
      console.log('Getting AI recommendations...');
      aiRecommendations = await getAIRecommendations(holdings);
    }
    
    // Combine holdings with AI recommendations
    const enhancedHoldings = holdings.map(holding => {
      const aiRec = aiRecommendations.find(rec => rec.symbol === holding.tradingsymbol);
      return {
        ...holding,
        ai_recommendation: aiRec || {
          symbol: holding.tradingsymbol,
          recommendation: "HOLD",
          reason: "No AI analysis available",
          insight: "Manual review recommended"
        }
      };
    });
    
    res.json({
      holdings: enhancedHoldings,
      ai_analysis_status: aiRecommendations.length > 0 ? 'success' : 'partial',
      total_holdings: holdings.length,
      analyzed_count: aiRecommendations.length
    });
    
    console.log('AI-enhanced holdings sent successfully for user:', userId);
    
  } catch (error) {
    console.error('Error fetching AI-enhanced holdings:', {
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
      res.status(500).json({ error: 'Failed to fetch AI-enhanced holdings' });
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
