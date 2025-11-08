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

// --- Azure Cognitive Search configuration ---
// Prefer environment variables, fallback to the values you provided.
const AZURE_SEARCH_ENDPOINT = process.env.AZURE_SEARCH_ENDPOINT;
const AZURE_SEARCH_INDEX = process.env.AZURE_SEARCH_INDEX;
const AZURE_SEARCH_QUERY_KEY = process.env.AZURE_SEARCH_QUERY_KEY;
const AZURE_SEARCH_API_VERSION = '2020-06-30'; // stable API version for simple search operations

/**
 * Perform a simple search against Azure Cognitive Search index.
 * @param {string} query - search string (use '*' or '' for match-all)
 * @param {number} top - max number of results to return
 */
async function azureSearch(query, top = 10) {
  const url = `${AZURE_SEARCH_ENDPOINT}/indexes/${encodeURIComponent(AZURE_SEARCH_INDEX)}/docs/search?api-version=${AZURE_SEARCH_API_VERSION}`;
  const body = {
    search: query || '*',
    top,
    // You can add additional options here (filter, select, highlight, etc.)
  };

  const resp = await axios.post(url, body, {
    headers: {
      'Content-Type': 'application/json',
      'api-key': AZURE_SEARCH_QUERY_KEY
    }
  });

  return resp.data;
}

/**
 * Retrieve a document by its key from the Azure Search index.
 * Note: The key field name depends on your index definition (usually 'id' or similar).
 */
async function azureGetDocumentById(id) {
  const url = `${AZURE_SEARCH_ENDPOINT}/indexes/${encodeURIComponent(AZURE_SEARCH_INDEX)}/docs/${encodeURIComponent(id)}?api-version=${AZURE_SEARCH_API_VERSION}`;
  const resp = await axios.get(url, {
    headers: {
      'api-key': AZURE_SEARCH_QUERY_KEY
    }
  });
  return resp.data;
}

// Hybrid AI Analysis Function - Quick and Detailed modes with Knowledge Base Context
async function getAIRecommendations(holdings, analysisMode = 'quick') {
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

    // Get relevant context from knowledge base
    let knowledgeContext = '';
    try {
      const stockSymbols = holdingsData.map(h => h.symbol).join(' ');
      const searchQuery = `investment analysis stock recommendations ${stockSymbols}`;
      console.log(`Searching knowledge base for: "${searchQuery}"`);
      
      const searchResults = await azureSearch(searchQuery, 3); // Get top 3 relevant documents
      
      if (searchResults.value && searchResults.value.length > 0) {
        knowledgeContext = searchResults.value.map((doc, index) => {
          const content = Object.entries(doc)
            .filter(([key, value]) => typeof value === 'string' && key !== '@search.score')
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
          return `Knowledge Document ${index + 1}:\n${content}`;
        }).join('\n\n---\n\n');
        
        console.log(`Found ${searchResults.value.length} relevant documents in knowledge base`);
      }
    } catch (searchError) {
      console.log('Knowledge base search failed, proceeding without context:', searchError.message);
    }

    let prompt;
    
    if (analysisMode === 'detailed') {
      // Comprehensive equity research prompt with knowledge base context
      prompt = `You are an expert equity research analyst and technical market strategist at a leading quant-driven investment firm. Provide comprehensive analysis for each stock using both market knowledge and the provided knowledge base context.

**Knowledge Base Context:**
${knowledgeContext || 'No specific knowledge base context available for these stocks.'}

**Analysis Framework:**
1. **Fundamental Analysis (1-5 score)**:
   - Business Model & Unit Economics
   - Growth Drivers & Catalysts  
   - Industry Positioning & Competitive Edge
   - Valuation Assessment
   - Financial Health & Quality
   - Risk Assessment

2. **Technical Analysis (1-5 score)**:
   - Price Momentum & Trend Analysis
   - Volume-Price Relationship
   - Support & Resistance Levels
   - Relative Strength vs Market
   - Entry/Exit Signals

3. **Investment Thesis**:
   - Bull/Base/Bear Case Scenarios
   - Key Catalysts & Risk Factors
   - Target Price & Time Horizon

**Scoring Scale:**
- 5: Very Strong/Positive (Strong BUY)
- 4: Strong/Positive (BUY) 
- 3: Neutral (HOLD)
- 2: Weak/Negative (SELL consideration)
- 1: Very Weak/Negative (Strong SELL)

**Analysis Rules:**
- Be decisive with recommendations (40-60% BUY, include SELL where justified)
- Consider P&L performance, quality metrics, and momentum
- Factor in Indian market context and sector dynamics
- Use knowledge base insights when available

Holdings Data:
${JSON.stringify(holdingsData, null, 2)}

Respond with detailed JSON:
[
  {
    "symbol": "STOCK_SYMBOL",
    "recommendation": "BUY",
    "fundamental_score": 4,
    "technical_score": 4,
    "overall_score": 4.0,
    "business_model": "Brief business model assessment",
    "growth_drivers": "Key growth catalysts",
    "competitive_edge": "Competitive advantages",
    "valuation_view": "Valuation assessment",
    "technical_view": "Technical momentum analysis",
    "bull_case": "Bull case scenario",
    "bear_case": "Bear case risks",
    "target_price": "₹XXX (upside/downside %)",
    "key_risks": "Primary risk factors",
    "investment_thesis": "Overall investment rationale",
    "knowledge_insights": "Insights from knowledge base (if any)"
  }
]`;
    } else {
      // Quick portfolio analysis prompt with knowledge base context
      prompt = `You are an expert equity research analyst. Provide quick but decisive portfolio analysis for these Indian stock holdings using both market knowledge and the provided knowledge base context.

**Knowledge Base Context:**
${knowledgeContext || 'No specific knowledge base context available for these stocks.'}

**Quick Analysis Framework:**
1. **Fundamental Score (1-5)**: Business health, growth prospects, valuation
2. **Technical Score (1-5)**: Price momentum, trend strength, patterns
3. **Risk Assessment**: Key risks and catalysts
4. **Action**: BUY/HOLD/SELL with rationale

**Key Factors:**
- P&L Performance: +5% = Strong signal, -5% = Weak signal
- Quality: Large-caps (RELIANCE, TCS, INFY, HDFC) get premium
- Value: Price below average = opportunity
- Momentum: Current price trends and relative strength
- Knowledge Base: Use relevant insights from provided context

**Be Aggressive**: 40-60% BUY recommendations, include SELL where justified

Holdings Data:
${JSON.stringify(holdingsData, null, 2)}

Respond ONLY with JSON:
[
  {
    "symbol": "STOCK_SYMBOL",
    "recommendation": "BUY",
    "fundamental_score": 4,
    "technical_score": 4,
    "overall_score": 4.0,
    "reason": "Strong fundamentals with positive momentum",
    "insight": "Quality business with growth catalysts",
    "risk_note": "Monitor sector headwinds",
    "action_priority": "High/Medium/Low",
    "knowledge_insights": "Relevant insights from knowledge base"
  }
]`;
    }

    console.log(`Running ${analysisMode} analysis for ${holdingsData.length} stocks with knowledge base context...`);
    const result = await model.generateContent(prompt);
    const aiResponse = result.response.text();
    
    console.log('Gemini AI Response with knowledge context:', aiResponse);
    
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
      console.log('Successfully parsed AI recommendations with knowledge context:', parsed.length, 'recommendations');
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
          insight: "AI analysis partially available - manual review suggested",
          knowledge_insights: "Knowledge base context integration failed"
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
        insight: "AI service temporarily unavailable",
        knowledge_insights: "Knowledge base not accessible"
      };
    });
  }
}

app.use(cors({
  origin: [
    'https://www.stockrecommend.site',
    'https://stockrecommend.site',
    'https://stock-watchlist-fixed-csj5optb1-noopurs-projects-93f3228e.vercel.app',
    'https://stock-watchlist-fixed-d6la2v6xr-noopurs-projects-93f3228e.vercel.app',
    'https://stock-watchlist-fixed-kpbphx347-noopurs-projects-93f3228e.vercel.app',
    'https://stock-watchlist-fixed-2nh7kty00-noopurs-projects-93f3228e.vercel.app',
    'https://nups.github.io',
    'https://nups.github.io/stockapi',
    'http://localhost:5500', // for local development
    'http://localhost:3000'  // Google OAuth frontend
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
    res.redirect(`https://www.stockrecommend.site/dashboard?session=${sessionToken}`);
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
  const analysisMode = req.query.mode || 'quick'; // Default to quick, allow ?mode=detailed
  
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
    console.log(`Holdings fetched for user: ${userId}, Count: ${holdings.length}, Mode: ${analysisMode}`);
    
    // Get AI recommendations if holdings exist
    let aiRecommendations = [];
    if (holdings && holdings.length > 0) {
      console.log(`Getting AI recommendations (${analysisMode} analysis)...`);
      aiRecommendations = await getAIRecommendations(holdings, analysisMode);
    }
    
    // Combine holdings with AI recommendations
    const enhancedHoldings = holdings.map(holding => {
      const aiRec = aiRecommendations.find(rec => rec.symbol === holding.tradingsymbol);
      return {
        ...holding,
        ai_recommendation: aiRec || {
          symbol: holding.tradingsymbol,
          recommendation: "HOLD",
          fundamental_score: 3,
          technical_score: 3,
          overall_score: 3.0,
          reason: "No AI analysis available",
          insight: "Manual review recommended"
        }
      };
    });
    
    res.json({
      holdings: enhancedHoldings,
      analysis_mode: analysisMode,
      ai_analysis_status: aiRecommendations.length > 0 ? 'success' : 'partial',
      total_holdings: holdings.length,
      analyzed_count: aiRecommendations.length,
      analysis_timestamp: new Date().toISOString()
    });
    
    console.log(`AI-enhanced holdings (${analysisMode}) sent successfully for user:`, userId);
    
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

// Public route to query the Azure Cognitive Search index
app.get('/api/search', async (req, res) => {
  const q = req.query.q || '*';
  const top = parseInt(req.query.top, 10) || 10;

  try {
    const results = await azureSearch(q, top);
    res.json({ status: 'ok', query: q, results });
  } catch (error) {
    console.error('Azure Search query error:', error.message || error);
    res.status(500).json({ status: 'error', message: 'Failed to query Azure Cognitive Search', details: error.message });
  }
});

// Public route to get a single document by id from the index
app.get('/api/search/doc', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Document id is required as ?id=' });

  try {
    const doc = await azureGetDocumentById(id);
    res.json({ status: 'ok', document: doc });
  } catch (error) {
    console.error('Azure Search get document error:', error.message || error);
    // If index or document is not found, surface a 404 when appropriate
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({ status: 'error', message: 'Failed to retrieve document from Azure Cognitive Search', details: error.response?.data || error.message });
  }
});

// Stock price API endpoint using Yahoo Finance
app.get('/api/stock-price/:symbol', async (req, res) => {
  try {
    let symbol = req.params.symbol;
    
    // Handle NSE: prefix and convert to Yahoo Finance format
    if (symbol.startsWith('NSE:')) {
      symbol = symbol.replace('NSE:', '') + '.NS';
    }
    // Handle BSE: prefix
    else if (symbol.startsWith('BSE:')) {
      symbol = symbol.replace('BSE:', '') + '.BO';
    }
    
    console.log(`Fetching price for symbol: ${symbol} (original: ${req.params.symbol})`);
    
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
    const data = response.data;
    
    if (data.chart && data.chart.result && data.chart.result[0]) {
      const result = data.chart.result[0];
      const price = result.meta.regularMarketPrice;
      const currency = result.meta.currency || 'USD';
      const marketState = result.meta.marketState || 'UNKNOWN';
      
      res.json({ 
        symbol: req.params.symbol, // Original symbol from request
        yahoo_symbol: symbol, // Converted symbol for Yahoo Finance
        price, 
        currency,
        marketState,
        success: true,
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({ symbol, price: null, success: false, message: 'No data found for symbol' });
    }
  } catch (error) {
    console.error(`Error fetching price for ${req.params.symbol}:`, error.message);
    res.json({ 
      symbol: req.params.symbol, 
      price: null, 
      success: false, 
      error: error.message 
    });
  }
});

// Stock details API endpoint with comprehensive information
app.get('/api/stock-details/:symbol', async (req, res) => {
  try {
    let symbol = req.params.symbol;
    const originalSymbol = req.params.symbol;
    
    // Handle NSE: prefix and convert to Yahoo Finance format
    if (symbol.startsWith('NSE:')) {
      symbol = symbol.replace('NSE:', '') + '.NS';
    }
    // Handle BSE: prefix
    else if (symbol.startsWith('BSE:')) {
      symbol = symbol.replace('BSE:', '') + '.BO';
    }
    
    console.log(`Fetching detailed info for symbol: ${symbol} (original: ${originalSymbol})`);
    
    // Get comprehensive stock data from Yahoo Finance
    const [chartResponse, quoteSummaryResponse] = await Promise.allSettled([
      axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`),
      axios.get(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=price,summaryDetail,defaultKeyStatistics,financialData`)
    ]);
    
    let stockDetails = {
      symbol: originalSymbol,
      yahoo_symbol: symbol,
      success: false,
      timestamp: new Date().toISOString()
    };
    
    // Process chart data (price info)
    if (chartResponse.status === 'fulfilled' && chartResponse.value.data.chart?.result?.[0]) {
      const chartData = chartResponse.value.data.chart.result[0];
      const meta = chartData.meta;
      
      stockDetails = {
        ...stockDetails,
        price: meta.regularMarketPrice,
        previousClose: meta.previousClose,
        open: meta.regularMarketOpen,
        dayHigh: meta.regularMarketDayHigh,
        dayLow: meta.regularMarketDayLow,
        volume: meta.regularMarketVolume,
        currency: meta.currency,
        marketState: meta.marketState,
        exchangeName: meta.exchangeName,
        instrumentType: meta.instrumentType,
        success: true
      };
    }
    
    // Process quote summary data (detailed financials)
    if (quoteSummaryResponse.status === 'fulfilled' && quoteSummaryResponse.value.data.quoteSummary?.result?.[0]) {
      const quoteData = quoteSummaryResponse.value.data.quoteSummary.result[0];
      
      // Add price details
      if (quoteData.price) {
        stockDetails.marketCap = quoteData.price.marketCap?.raw;
        stockDetails.shortName = quoteData.price.shortName;
        stockDetails.longName = quoteData.price.longName;
      }
      
      // Add summary details
      if (quoteData.summaryDetail) {
        stockDetails.pe = quoteData.summaryDetail.trailingPE?.raw;
        stockDetails.forwardPE = quoteData.summaryDetail.forwardPE?.raw;
        stockDetails.dividendYield = quoteData.summaryDetail.dividendYield?.raw;
        stockDetails.week52High = quoteData.summaryDetail.fiftyTwoWeekHigh?.raw;
        stockDetails.week52Low = quoteData.summaryDetail.fiftyTwoWeekLow?.raw;
        stockDetails.avgVolume = quoteData.summaryDetail.averageVolume?.raw;
      }
      
      // Add key statistics
      if (quoteData.defaultKeyStatistics) {
        stockDetails.eps = quoteData.defaultKeyStatistics.trailingEps?.raw;
        stockDetails.bookValue = quoteData.defaultKeyStatistics.bookValue?.raw;
        stockDetails.priceToBook = quoteData.defaultKeyStatistics.priceToBook?.raw;
      }
      
      // Add financial data
      if (quoteData.financialData) {
        stockDetails.revenueGrowth = quoteData.financialData.revenueGrowth?.raw;
        stockDetails.profitMargin = quoteData.financialData.profitMargins?.raw;
        stockDetails.returnOnEquity = quoteData.financialData.returnOnEquity?.raw;
        stockDetails.debtToEquity = quoteData.financialData.debtToEquity?.raw;
      }
    }
    
    // Calculate percentage change
    if (stockDetails.price && stockDetails.previousClose) {
      const change = stockDetails.price - stockDetails.previousClose;
      const changePercent = (change / stockDetails.previousClose) * 100;
      stockDetails.change = parseFloat(change.toFixed(2));
      stockDetails.changePercent = parseFloat(changePercent.toFixed(2));
    }
    
    res.json(stockDetails);
    
  } catch (error) {
    console.error(`Error fetching details for ${req.params.symbol}:`, error.message);
    res.json({
      symbol: req.params.symbol,
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Google OAuth 2.0 token exchange endpoint
app.post('/api/auth/google/token', async (req, res) => {
  try {
    const { code, redirect_uri } = req.body;
    
    // Validate required parameters
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code is required'
      });
    }
    
    if (!redirect_uri) {
      return res.status(400).json({
        success: false,
        error: 'Redirect URI is required'
      });
    }
    
    // Validate environment variables
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      console.error('Missing Google OAuth credentials:', {
        clientId: clientId ? 'Present' : 'Missing',
        clientSecret: clientSecret ? 'Present' : 'Missing'
      });
      return res.status(500).json({
        success: false,
        error: 'Google OAuth configuration is incomplete'
      });
    }
    
    console.log('Google OAuth token exchange started:', {
      code: code.substring(0, 20) + '...',  // Log partial code for debugging
      redirect_uri,
      timestamp: new Date().toISOString()
    });
    
    // Step 1: Exchange authorization code for access token
    const tokenRequestData = {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri,
      grant_type: 'authorization_code'
    };
    
    console.log('Exchanging code for access token...');
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', tokenRequestData, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 10000  // 10 second timeout
    });
    
    const { access_token, token_type, expires_in, refresh_token, scope } = tokenResponse.data;
    
    if (!access_token) {
      console.error('No access token received from Google');
      return res.status(500).json({
        success: false,
        error: 'Failed to obtain access token from Google'
      });
    }
    
    console.log('Access token received successfully:', {
      token_type,
      expires_in,
      scope,
      has_refresh_token: !!refresh_token
    });
    
    // Step 2: Use access token to fetch user profile
    console.log('Fetching user profile from Google...');
    const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `${token_type} ${access_token}`,
        'Accept': 'application/json'
      },
      timeout: 10000  // 10 second timeout
    });
    
    const googleUser = userResponse.data;
    console.log('User profile received:', {
      id: googleUser.id,
      name: googleUser.name,
      email: googleUser.email,
      verified_email: googleUser.verified_email,
      has_picture: !!googleUser.picture
    });
    
    // Step 3: Format user data according to requirements
    const userData = {
      user_id: googleUser.id,
      user_name: googleUser.name || 'Google User',
      email: googleUser.email,
      picture: googleUser.picture || null,
      broker: 'google',
      verified_email: googleUser.verified_email || false,
      locale: googleUser.locale || null,
      created_at: new Date().toISOString()
    };
    
    // Step 4: Generate session token and store user data in Redis (optional)
    const sessionToken = crypto.randomBytes(32).toString('hex');
    
    try {
      // Store Google user session in Redis (expires in 1 hour)
      await redisClient.setEx(`google_session:${sessionToken}`, 3600, JSON.stringify({
        access_token,
        refresh_token,
        user_data: userData,
        expires_at: new Date(Date.now() + (expires_in * 1000)).toISOString()
      }));
      
      console.log(`Google user session stored: ${userData.user_id} with session: ${sessionToken}`);
    } catch (redisError) {
      console.error('Redis storage failed (non-critical):', redisError.message);
      // Continue without Redis storage
    }
    
    // Step 5: Return successful response
    const response = {
      success: true,
      access_token,
      user: userData,
      session_token: sessionToken,  // Optional: for session management
      expires_in,
      timestamp: new Date().toISOString()
    };
    
    console.log('Google OAuth flow completed successfully for user:', userData.user_name);
    res.json(response);
    
  } catch (error) {
    console.error('Google OAuth error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      code: error.code,
      timestamp: new Date().toISOString()
    });
    
    // Handle specific error cases
    let errorMessage = 'Internal server error during Google OAuth';
    let statusCode = 500;
    
    if (error.response) {
      // HTTP error from Google APIs
      statusCode = error.response.status;
      
      if (statusCode === 400) {
        errorMessage = 'Invalid authorization code or redirect URI';
      } else if (statusCode === 401) {
        errorMessage = 'Invalid or expired authorization code';
      } else if (statusCode === 403) {
        errorMessage = 'Google OAuth access forbidden - check client configuration';
      } else if (statusCode >= 500) {
        errorMessage = 'Google services temporarily unavailable';
      }
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Request timeout - Google services may be slow';
      statusCode = 408;
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      errorMessage = 'Unable to connect to Google services';
      statusCode = 503;
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
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
