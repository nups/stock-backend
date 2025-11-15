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

// Google Gemini model - using gemini-pro (stable in v1beta API)
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// Function to list models using direct HTTP call
async function listModelsDirectly() {
  try {
    console.log('🔍 Calling Google API directly to list models...');
    const apiKey = process.env.GEMINI_API_KEY;
    const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    
    console.log('📋 Available models from direct API call:');
    const models = response.data.models || [];
    
    const supportedModels = [];
    for (const model of models) {
      const modelId = model.name.replace('models/', '');
      console.log(`- ${modelId} (${model.displayName || 'No display name'})`);
      console.log(`  Supported methods: ${model.supportedGenerationMethods?.join(', ') || 'unknown'}`);
      
      if (model.supportedGenerationMethods?.includes('generateContent')) {
        supportedModels.push(modelId);
      }
    }
    
    console.log('\n✅ Models that support generateContent:');
    supportedModels.forEach(model => console.log(`- ${model}`));
    
    return supportedModels;
    
  } catch (error) {
    console.error('❌ Failed to list models directly:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    return [];
  }
}

// Function to test available models by trying them
async function findWorkingModel() {
  console.log('🔍 First, let\'s see what models are actually available...');
  
  // Get the real list of models from Google's API
  const availableModels = await listModelsDirectly();
  
  if (availableModels.length === 0) {
    console.error('❌ No models available that support generateContent');
    return { modelName: null, success: false };
  }
  
  // Test the first available model
  console.log(`🧪 Testing first available model: ${availableModels[0]}`);
  
  try {
    const testModel = genAI.getGenerativeModel({ model: availableModels[0] });
    const testResult = await testModel.generateContent("Hello");
    
    console.log(`✅ SUCCESS: ${availableModels[0]} works!`);
    return { modelName: availableModels[0], success: true, allAvailable: availableModels };
    
  } catch (error) {
    console.log(`❌ FAILED: ${availableModels[0]} - ${error.message}`);
  
  console.log('� Testing available models by trying each one...');
  
  for (let i = 1; i < Math.min(availableModels.length, 3); i++) {
    try {
      console.log(`🧪 Testing model: ${availableModels[i]}`);
      const testModel2 = genAI.getGenerativeModel({ model: availableModels[i] });
      const testResult2 = await testModel2.generateContent("Hello");
      
      console.log(`✅ SUCCESS: ${availableModels[i]} works!`);
      return { modelName: availableModels[i], success: true, allAvailable: availableModels };
      
    } catch (innerError) {
      console.log(`❌ FAILED: ${availableModels[i]} - ${innerError.message}`);
      continue;
    }
  }
  
  console.error('❌ No working models found from the available list');
  return { modelName: null, success: false, allAvailable: availableModels };
  }
}

// Test function to verify Gemini API is working
async function testGeminiAPI() {
  try {
    console.log('🧪 Testing Gemini API connection...');
    
    // First, let's call the models API directly to see what's available
    console.log('🔍 Calling Google API directly to list models...');
    const apiKey = process.env.GEMINI_API_KEY;
    const modelsResponse = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    
    console.log('📋 Available models from direct API call:');
    const models = modelsResponse.data.models || [];
    
    if (models.length === 0) {
      console.error('❌ No models available at all!');
      return { success: false, error: 'No models available' };
    }
    
    console.log(`Found ${models.length} total models:`);
    const supportedModels = [];
    for (const model of models) {
      const modelId = model.name.replace('models/', '');
      console.log(`- ${modelId} (${model.displayName || 'No display name'})`);
      console.log(`  Supported methods: ${model.supportedGenerationMethods?.join(', ') || 'unknown'}`);
      
      if (model.supportedGenerationMethods?.includes('generateContent')) {
        supportedModels.push(modelId);
      }
    }
    
    console.log('\n✅ Models that support generateContent:');
    supportedModels.forEach(model => console.log(`- ${model}`));
    
    if (supportedModels.length === 0) {
      console.error('❌ No models support generateContent');
      return { success: false, error: 'No models support generateContent' };
    }
    
    // Try the first supported model
    const workingModel = supportedModels[0];
    console.log(`🧪 Testing first supported model: ${workingModel}`);
    
    const testModel = genAI.getGenerativeModel({ model: workingModel });
    const testResult = await testModel.generateContent("Hello");
    const response = testResult.response.text();
    
    console.log(`✅ SUCCESS: ${workingModel} works!`);
    console.log('Response:', response);
    
    return { success: true, workingModel, allSupportedModels: supportedModels };
    
  } catch (error) {
    console.error('❌ Gemini API test failed:', error.message);
    return { success: false, error: error.message };
  }
}

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

// Initialize system after Redis connection
redisClient.on('ready', () => {
  initializeSystem();
});

// --- Azure Cognitive Search configuration ---
// Prefer environment variables, fallback to the values you provided.
const AZURE_SEARCH_ENDPOINT = process.env.AZURE_SEARCH_ENDPOINT;
const AZURE_SEARCH_INDEX = process.env.AZURE_SEARCH_INDEX;
const AZURE_SEARCH_QUERY_KEY = process.env.AZURE_SEARCH_QUERY_KEY;
const AZURE_SEARCH_API_VERSION = '2020-06-30'; // stable API version for simple search operations

// --- Whitelist Configuration ---
const ENABLE_WHITELIST = process.env.ENABLE_WHITELIST === 'true'; // Enable/disable whitelist feature
const WHITELIST_KEY = 'user_whitelist'; // Redis key for storing whitelist
const ADMIN_WHITELIST_KEY = 'admin_whitelist'; // Redis key for storing admin users
const INITIAL_ADMIN_SETUP_KEY = process.env.INITIAL_ADMIN_SETUP_KEY; // One-time setup key
const SUPER_ADMIN_MODE = process.env.SUPER_ADMIN_MODE === 'true'; // Bypass whitelist entirely (dev only)

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

// --- Whitelist Management Functions ---

/**
 * Check if a user (email or user_id) is whitelisted
 * @param {string} identifier - email or user_id to check
 * @returns {boolean} - true if whitelisted, false otherwise
 */
async function isUserWhitelisted(identifier) {
  if (!ENABLE_WHITELIST) {
    return true; // If whitelist is disabled, allow everyone
  }
  
  if (!identifier) {
    return false;
  }
  
  try {
    // Check if identifier is in the whitelist set
    const isWhitelisted = await redisClient.sIsMember(WHITELIST_KEY, identifier.toLowerCase());
    return isWhitelisted;
  } catch (error) {
    console.error('Error checking whitelist:', error);
    return false; // Fail closed - deny access on error
  }
}

/**
 * Add user to whitelist
 * @param {string} identifier - email or user_id to add
 * @returns {boolean} - true if added successfully
 */
async function addToWhitelist(identifier) {
  if (!identifier) return false;
  
  try {
    const added = await redisClient.sAdd(WHITELIST_KEY, identifier.toLowerCase());
    console.log(`User ${identifier} added to whitelist. New addition: ${added > 0}`);
    return true;
  } catch (error) {
    console.error('Error adding to whitelist:', error);
    return false;
  }
}

/**
 * Remove user from whitelist
 * @param {string} identifier - email or user_id to remove
 * @returns {boolean} - true if removed successfully
 */
async function removeFromWhitelist(identifier) {
  if (!identifier) return false;
  
  try {
    const removed = await redisClient.sRem(WHITELIST_KEY, identifier.toLowerCase());
    console.log(`User ${identifier} removed from whitelist. Was present: ${removed > 0}`);
    return true;
  } catch (error) {
    console.error('Error removing from whitelist:', error);
    return false;
  }
}

/**
 * Get all whitelisted users
 * @returns {Array} - array of whitelisted identifiers
 */
async function getWhitelistedUsers() {
  try {
    const users = await redisClient.sMembers(WHITELIST_KEY);
    return users;
  } catch (error) {
    console.error('Error getting whitelist:', error);
    return [];
  }
}

/**
 * Check if a user is an admin
 * @param {string} identifier - email or user_id to check
 * @returns {boolean} - true if admin, false otherwise
 */
async function isUserAdmin(identifier) {
  if (!identifier) return false;
  
  try {
    const isAdmin = await redisClient.sIsMember(ADMIN_WHITELIST_KEY, identifier.toLowerCase());
    return isAdmin;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Add user to admin list
 * @param {string} identifier - email or user_id to add as admin
 * @returns {boolean} - true if added successfully
 */
async function addAdmin(identifier) {
  if (!identifier) return false;
  
  try {
    const added = await redisClient.sAdd(ADMIN_WHITELIST_KEY, identifier.toLowerCase());
    console.log(`Admin ${identifier} added. New addition: ${added > 0}`);
    return true;
  } catch (error) {
    console.error('Error adding admin:', error);
    return false;
  }
}

/**
 * Get all admin users
 * @returns {Array} - array of admin identifiers
 */
async function getAdminUsers() {
  try {
    const admins = await redisClient.sMembers(ADMIN_WHITELIST_KEY);
    return admins;
  } catch (error) {
    console.error('Error getting admin list:', error);
    return [];
  }
}

/**
 * Initialize system - setup initial state
 */
async function initializeSystem() {
  try {
    // Check if any admins exist
    const adminCount = await redisClient.sCard(ADMIN_WHITELIST_KEY);
    
    if (adminCount === 0) {
      console.log('⚠️  No admins found. System is in setup mode.');
      console.log('💡 Use INITIAL_ADMIN_SETUP_KEY to create first admin via API');
      console.log('🔗 POST /api/admin/setup with setup_key and admin_identifier');
    } else {
      const admins = await getAdminUsers();
      console.log(`✅ System initialized with ${adminCount} admin(s):`, admins.map(a => a.substring(0, 3) + '***'));
    }
    
    // Log whitelist status
    const whitelistCount = await redisClient.sCard(WHITELIST_KEY);
    console.log(`📋 Whitelist contains ${whitelistCount} user(s)`);
    
  } catch (error) {
    console.error('Error initializing system:', error);
  }
}

// --- Authentication Middleware ---

/**
 * Middleware to check if user is whitelisted (for session-based auth)
 */
async function checkWhitelistMiddleware(req, res, next) {
  if (!ENABLE_WHITELIST) {
    return next(); // Skip if whitelist is disabled
  }
  
  try {
    const sessionToken = req.query.session || req.body.session_token;
    
    if (!sessionToken) {
      return res.status(401).json({
        error: 'Authentication required',
        whitelist_enabled: true,
        debug_info: 'No session token provided'
      });
    }
    
    console.log(`🔍 Checking session token: ${sessionToken.substring(0, 8)}...`);
    
    // Get session data from Redis (try both Zerodha and Google sessions)
    let sessionData = await redisClient.get(`session:${sessionToken}`);
    let userIdentifier = null;
    let sessionType = null;
    
    if (sessionData) {
      // Zerodha session
      console.log('✅ Found Zerodha session');
      const session = JSON.parse(sessionData);
      userIdentifier = session.user_id;
      sessionType = 'zerodha';
    } else {
      // Try Google session
      console.log('🔍 Trying Google session...');
      sessionData = await redisClient.get(`google_session:${sessionToken}`);
      if (sessionData) {
        console.log('✅ Found Google session');
        const session = JSON.parse(sessionData);
        userIdentifier = session.user_data?.email || session.user_data?.user_id;
        sessionType = 'google';
        
        // Check if Google session has expired
        if (session.expires_at) {
          const expiresAt = new Date(session.expires_at);
          const now = new Date();
          if (now > expiresAt) {
            console.log('❌ Google session expired');
            await redisClient.del(`google_session:${sessionToken}`);
            return res.status(401).json({
              error: 'Session expired',
              whitelist_enabled: true,
              debug_info: 'Google session has expired'
            });
          }
        }
      } else {
        console.log('❌ No session found in Redis');
      }
    }
    
    if (!userIdentifier) {
      return res.status(401).json({
        error: 'Invalid or expired session',
        whitelist_enabled: true,
        debug_info: `No valid session found for token: ${sessionToken.substring(0, 8)}...`,
        troubleshooting: {
          message: 'Your session may have expired or was not properly stored',
          solutions: [
            'Google sessions expire after 1 hour - try logging in again',
            'Check if you completed the full OAuth flow',
            'Verify Redis connection is working'
          ],
          debug_endpoint: `/api/debug/session?session_token=${sessionToken}`,
          relogin_needed: true
        }
      });
    }
    
    console.log(`👤 User identified: ${userIdentifier} (${sessionType} session)`);
    
    // Check if user is whitelisted
    const isWhitelisted = await isUserWhitelisted(userIdentifier);
    
    if (!isWhitelisted) {
      console.log(`❌ Access denied for non-whitelisted user: ${userIdentifier}`);
      return res.status(403).json({
        error: 'Access denied. Your account is not authorized to use this service.',
        message: 'Please contact support to request access.',
        user_id: userIdentifier,
        whitelist_enabled: true,
        debug_info: `User ${userIdentifier} is not whitelisted`
      });
    }
    
    console.log(`✅ User ${userIdentifier} is whitelisted - access granted`);
    
    // Add user info to request for downstream use
    req.user = { identifier: userIdentifier, whitelisted: true, session_type: sessionType };
    next();
    
  } catch (error) {
    console.error('Whitelist middleware error:', error);
    res.status(500).json({
      error: 'Authentication service error',
      whitelist_enabled: true
    });
  }
}

/**
 * Check if user is admin (for whitelist management)
 * Now uses session-based admin checking instead of just admin key
 */
async function checkAdminMiddleware(req, res, next) {
  try {
    // Super admin mode bypass (development only)
    if (SUPER_ADMIN_MODE) {
      console.log('⚠️  SUPER_ADMIN_MODE is enabled - bypassing admin check');
      req.user = { identifier: 'super_admin', is_admin: true };
      return next();
    }
    
    const sessionToken = req.query.session || req.body.session_token;
    
    if (!sessionToken) {
      return res.status(401).json({
        error: 'Admin session required',
        message: 'You must be logged in as an admin to perform this action'
      });
    }
    
    // Get session data from Redis (try both Zerodha and Google sessions)
    let sessionData = await redisClient.get(`session:${sessionToken}`);
    let userIdentifier = null;
    
    if (sessionData) {
      // Zerodha session
      const session = JSON.parse(sessionData);
      userIdentifier = session.user_id;
    } else {
      // Try Google session
      sessionData = await redisClient.get(`google_session:${sessionToken}`);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        userIdentifier = session.user_data?.email || session.user_data?.user_id;
      }
    }
    
    if (!userIdentifier) {
      return res.status(401).json({
        error: 'Invalid or expired session',
        message: 'Please log in again'
      });
    }
    
    // Check if user is an admin
    const isAdmin = await isUserAdmin(userIdentifier);
    
    if (!isAdmin) {
      console.log(`Admin access denied for user: ${userIdentifier}`);
      return res.status(403).json({
        error: 'Admin privileges required',
        message: 'Only administrators can perform this action',
        user_id: userIdentifier
      });
    }
    
    // Add admin info to request
    req.user = { identifier: userIdentifier, is_admin: true };
    next();
    
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ error: 'Admin authentication service error' });
  }
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
    
    // Debug Gemini setup
    console.log('🔧 Gemini API setup check:');
    console.log('- API Key present:', !!process.env.GEMINI_API_KEY);
    console.log('- API Key preview:', process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.substring(0, 10)}...` : 'MISSING');
    console.log('- Model: gemini-pro (v1beta compatible)');
    console.log('- Model initialized:', !!model);
    console.log('- Prompt length:', prompt.length, 'characters');
    
    console.log('🚀 Calling Gemini API with gemini-pro model...');
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
    console.error('🚨 Gemini AI ERROR - Full Details:');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error status:', error.status);
    console.error('Full error object:', error);
    
    // Check for specific Gemini API issues
    if (error.message?.includes('API_KEY')) {
      console.error('❌ GEMINI_API_KEY environment variable issue');
    }
    if (error.message?.includes('quota') || error.message?.includes('limit')) {
      console.error('❌ Gemini API quota/rate limit exceeded');
    }
    if (error.message?.includes('network') || error.code === 'ENOTFOUND') {
      console.error('❌ Network connectivity issue to Gemini API');
    }
    
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
app.get('/api/zerodha/holdings', checkWhitelistMiddleware, async (req, res) => {
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
app.get('/api/zerodha/holdings-ai', checkWhitelistMiddleware, async (req, res) => {
  const sessionToken = req.query.session;
  const analysisMode = req.query.mode || 'quick'; // Default to quick, allow ?mode=detailed
  
  // Check if this is a single stock analysis request
  const symbol = req.query.symbol;
  const company = req.query.company;
  const stockname = req.query.stockname;
  const trading_symbol = req.query.trading_symbol;
  const industry = req.query.industry;
  const current_price = req.query.current_price;
  const entry_price = req.query.entry_price;
  
  if (!sessionToken) {
    return res.status(400).json({ error: 'Session token is required' });
  }
  
  try {
    // Handle individual stock analysis - doesn't need Zerodha API
    if (symbol || company || stockname) {
      console.log('Fetching AI recommendation for:', company || stockname || symbol);
      console.log(`✅ Individual stock analysis - using authenticated session (${req.user?.session_type})`);
      
      // Create a mock stock object for individual analysis
      const stockData = {
        yahooSymbol: symbol || trading_symbol || 'N/A',
        companyName: company || stockname || symbol || 'Unknown Company',
        tradingsymbol: trading_symbol || symbol || 'N/A',
        industry: industry || '',
        suggested_price: parseFloat(entry_price) || 0,
        last_price: parseFloat(current_price) || 0,
        average_price: parseFloat(entry_price) || 0,
        quantity: 1 // Default quantity for individual analysis
      };
      
      console.log('Analyzing individual stock:', {
        symbol: stockData.yahooSymbol,
        company: stockData.companyName,
        current_price: stockData.last_price,
        entry_price: stockData.average_price,
        user_session_type: req.user?.session_type || 'unknown'
      });
      
      // Get AI recommendation for the individual stock
      const aiRecommendations = await getAIRecommendations([stockData], analysisMode);
      
      const recommendation = aiRecommendations[0] || {
        symbol: stockData.tradingsymbol,
        recommendation: "HOLD",
        fundamental_score: 3,
        technical_score: 3,
        overall_score: 3.0,
        reason: "No AI analysis available",
        insight: "Manual review recommended"
      };
      
      res.json({
        stock_analysis: {
          ...stockData,
          ai_recommendation: recommendation
        },
        analysis_mode: analysisMode,
        ai_analysis_status: aiRecommendations.length > 0 ? 'success' : 'partial',
        analysis_timestamp: new Date().toISOString(),
        session_info: {
          user_identifier: req.user?.identifier,
          session_type: req.user?.session_type
        },
        query_parameters: {
          symbol,
          company,
          stockname,
          trading_symbol,
          industry,
          current_price,
          entry_price
        }
      });
      
      console.log(`✅ Individual stock AI analysis completed for: ${stockData.companyName}`);
      return;
    }
    
    // Handle bulk holdings analysis (original functionality) - requires Zerodha session
    console.log(`🔍 Bulk holdings analysis - requires Zerodha access token`);
    
    // For bulk analysis, we need Zerodha session specifically
    const zerodhaSessionData = await redisClient.get(`session:${sessionToken}`);
    if (!zerodhaSessionData) {
      return res.status(400).json({ 
        error: 'Bulk holdings analysis requires Zerodha authentication',
        message: 'Please log in with Zerodha to fetch your portfolio holdings',
        individual_stock_analysis: 'Available with Google or Zerodha session'
      });
    }
    
    const { access_token: zerodhaAccessToken, user_id: zerodhaUserId } = JSON.parse(zerodhaSessionData);
    
    // Fetch holdings from Zerodha
    const response = await axios.get('https://api.kite.trade/portfolio/holdings', {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${zerodhaAccessToken}`
      }
    });
    
    const holdings = response.data.data;
    console.log(`Holdings fetched for user: ${zerodhaUserId}, Count: ${holdings.length}, Mode: ${analysisMode}`);
    
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
    
    // Check if user is whitelisted (if whitelist is enabled)
    if (ENABLE_WHITELIST) {
      const userEmail = googleUser.email;
      const userId = googleUser.id;
      
      // Check both email and user ID for whitelist
      const emailWhitelisted = await isUserWhitelisted(userEmail);
      const idWhitelisted = await isUserWhitelisted(userId);
      
      if (!emailWhitelisted && !idWhitelisted) {
        console.log(`Access denied for non-whitelisted Google user: ${userEmail} (${userId})`);
        return res.status(403).json({
          success: false,
          error: 'Access denied. Your account is not authorized to use this service.',
          message: 'Please contact support to request access.',
          user_email: userEmail,
          user_id: userId,
          whitelist_enabled: true,
          support_contact: 'Please contact support for access requests.'
        });
      }
      
      console.log(`Whitelisted Google user authenticated: ${userEmail}`);
    }
    
    // Step 4: Generate session token and store user data in Redis (optional)
    const sessionToken = crypto.randomBytes(32).toString('hex');
    
    try {
      // Store Google user session in Redis (expires in 1 hour)
      const sessionData = {
        access_token,
        refresh_token,
        user_data: userData,
        expires_at: new Date(Date.now() + (expires_in * 1000)).toISOString(),
        created_at: new Date().toISOString()
      };
      
      await redisClient.setEx(`google_session:${sessionToken}`, 3600, JSON.stringify(sessionData));
      
      // Verify storage worked
      const verifyStorage = await redisClient.get(`google_session:${sessionToken}`);
      if (verifyStorage) {
        console.log(`✅ Google session VERIFIED stored: ${userData.user_id} with session: ${sessionToken.substring(0, 8)}...`);
        console.log(`📅 Session expires at: ${sessionData.expires_at} (TTL: 3600s)`);
      } else {
        console.error('❌ Session storage verification FAILED - session not found after storage attempt');
      }
    } catch (redisError) {
      console.error('❌ Redis storage failed (CRITICAL):', redisError.message);
      console.error('🚨 User will get 401 errors - session not persisted!');
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

// Google OAuth logout endpoint
app.post('/api/auth/google/logout', async (req, res) => {
  try {
    const { session_token, access_token } = req.body;
    
    console.log('Google OAuth logout started:', {
      has_session_token: !!session_token,
      has_access_token: !!access_token,
      timestamp: new Date().toISOString()
    });
    
    // Step 1: Remove session from Redis if session_token provided
    if (session_token) {
      try {
        const sessionKey = `google_session:${session_token}`;
        const deleted = await redisClient.del(sessionKey);
        console.log(`Session removed from Redis: ${sessionKey}, deleted: ${deleted > 0}`);
      } catch (redisError) {
        console.error('Redis session cleanup failed (non-critical):', redisError.message);
      }
    }
    
    // Step 2: Revoke Google access token if provided
    if (access_token) {
      try {
        console.log('Revoking Google access token...');
        await axios.post('https://oauth2.googleapis.com/revoke', null, {
          params: {
            token: access_token
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 5000  // 5 second timeout
        });
        console.log('Google access token revoked successfully');
      } catch (revokeError) {
        console.error('Google token revocation failed (non-critical):', {
          status: revokeError.response?.status,
          data: revokeError.response?.data,
          message: revokeError.message
        });
        // Continue even if revocation fails - user is still logged out locally
      }
    }
    
    // Step 3: Return successful logout response
    const response = {
      success: true,
      message: 'Logout successful',
      session_cleared: !!session_token,
      token_revoked: !!access_token,
      timestamp: new Date().toISOString()
    };
    
    console.log('Google OAuth logout completed successfully');
    res.json(response);
    
  } catch (error) {
    console.error('Google OAuth logout error:', {
      message: error.message,
      status: error.response?.status,
      timestamp: new Date().toISOString()
    });
    
    // Even if there's an error, return success for logout (fail-safe)
    res.json({
      success: true,
      message: 'Logout completed (with errors)',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Generic logout endpoint (handles both Google and Zerodha sessions)
app.post('/api/auth/logout', async (req, res) => {
  try {
    const { session_token, broker = 'zerodha' } = req.body;
    
    console.log('Generic logout started:', {
      broker,
      has_session_token: !!session_token,
      timestamp: new Date().toISOString()
    });
    
    if (!session_token) {
      return res.json({
        success: true,
        message: 'No session to clear',
        timestamp: new Date().toISOString()
      });
    }
    
    // Determine session key based on broker
    let sessionKey;
    if (broker === 'google') {
      sessionKey = `google_session:${session_token}`;
    } else {
      sessionKey = `session:${session_token}`;  // Zerodha sessions
    }
    
    try {
      const deleted = await redisClient.del(sessionKey);
      console.log(`Session removed: ${sessionKey}, deleted: ${deleted > 0}`);
      
      res.json({
        success: true,
        message: 'Logout successful',
        session_cleared: deleted > 0,
        broker,
        timestamp: new Date().toISOString()
      });
    } catch (redisError) {
      console.error('Redis cleanup failed:', redisError.message);
      
      // Still return success for logout
      res.json({
        success: true,
        message: 'Logout completed (session cleanup failed)',
        session_cleared: false,
        broker,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('Generic logout error:', error.message);
    
    // Always return success for logout (fail-safe)
    res.json({
      success: true,
      message: 'Logout completed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Debug endpoint to check session status (development only)
app.get('/api/debug/session', async (req, res) => {
  try {
    const { session_token } = req.query;
    
    if (!session_token) {
      return res.status(400).json({
        error: 'session_token query parameter is required'
      });
    }
    
    console.log(`🔍 Debug: Checking session ${session_token.substring(0, 8)}...`);
    
    // Check both session types
    const zerodhaSession = await redisClient.get(`session:${session_token}`);
    const googleSession = await redisClient.get(`google_session:${session_token}`);
    
    const result = {
      session_token: session_token.substring(0, 8) + '...',
      zerodha_session: {
        exists: !!zerodhaSession,
        data: zerodhaSession ? JSON.parse(zerodhaSession) : null
      },
      google_session: {
        exists: !!googleSession,
        data: googleSession ? JSON.parse(googleSession) : null
      },
      whitelist_enabled: ENABLE_WHITELIST,
      timestamp: new Date().toISOString()
    };
    
    // Check whitelist status if session exists
    if (zerodhaSession) {
      const session = JSON.parse(zerodhaSession);
      result.zerodha_session.whitelisted = await isUserWhitelisted(session.user_id);
    }
    
    if (googleSession) {
      const session = JSON.parse(googleSession);
      const userIdentifier = session.user_data?.email || session.user_data?.user_id;
      result.google_session.whitelisted = await isUserWhitelisted(userIdentifier);
      
      // Check expiration
      if (session.expires_at) {
        const expiresAt = new Date(session.expires_at);
        const now = new Date();
        result.google_session.expired = now > expiresAt;
        result.google_session.expires_at = session.expires_at;
      }
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Debug session error:', error);
    res.status(500).json({
      error: 'Debug session failed',
      message: error.message
    });
  }
});

// Session validation endpoint
app.get('/api/auth/validate', async (req, res) => {
  try {
    const { session_token, broker = 'zerodha' } = req.query;
    
    if (!session_token) {
      return res.status(400).json({
        success: false,
        error: 'Session token is required',
        valid: false
      });
    }
    
    // Determine session key based on broker
    let sessionKey;
    if (broker === 'google') {
      sessionKey = `google_session:${session_token}`;
    } else {
      sessionKey = `session:${session_token}`;
    }
    
    try {
      const sessionData = await redisClient.get(sessionKey);
      
      if (!sessionData) {
        return res.json({
          success: true,
          valid: false,
          message: 'Session not found or expired',
          broker
        });
      }
      
      const session = JSON.parse(sessionData);
      const now = new Date();
      
      // Check if Google session has expired
      if (broker === 'google' && session.expires_at) {
        const expiresAt = new Date(session.expires_at);
        if (now > expiresAt) {
          // Clean up expired session
          await redisClient.del(sessionKey);
          return res.json({
            success: true,
            valid: false,
            message: 'Session expired',
            broker
          });
        }
      }
      
      res.json({
        success: true,
        valid: true,
        message: 'Session is valid',
        broker,
        user_id: session.user_data?.user_id || session.user_id,
        expires_at: session.expires_at || null
      });
      
    } catch (redisError) {
      console.error('Redis session validation failed:', redisError.message);
      res.status(500).json({
        success: false,
        error: 'Session validation failed',
        valid: false
      });
    }
    
  } catch (error) {
    console.error('Session validation error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      valid: false
    });
  }
});

// --- Initial System Setup Endpoint ---

// One-time setup endpoint to create the first admin
app.post('/api/admin/setup', async (req, res) => {
  try {
    const { setup_key, admin_identifier } = req.body;
    
    // Check if setup key is provided and correct
    if (!INITIAL_ADMIN_SETUP_KEY || setup_key !== INITIAL_ADMIN_SETUP_KEY) {
      return res.status(403).json({
        error: 'Invalid setup key',
        message: 'Setup key is required for initial admin creation'
      });
    }
    
    if (!admin_identifier) {
      return res.status(400).json({
        error: 'Admin identifier required',
        message: 'Please provide admin_identifier (email or user_id)'
      });
    }
    
    // Check if any admins already exist
    const existingAdminCount = await redisClient.sCard(ADMIN_WHITELIST_KEY);
    if (existingAdminCount > 0) {
      return res.status(409).json({
        error: 'System already initialized',
        message: 'Admin users already exist. Use admin endpoints for further management.',
        existing_admins: existingAdminCount
      });
    }
    
    // Create first admin
    const adminAdded = await addAdmin(admin_identifier);
    const whitelistAdded = await addToWhitelist(admin_identifier); // Also add to whitelist
    
    if (adminAdded && whitelistAdded) {
      console.log(`🎉 System initialized with first admin: ${admin_identifier}`);
      res.json({
        success: true,
        message: 'System initialized successfully',
        admin_identifier: admin_identifier.toLowerCase(),
        note: 'This setup endpoint is now disabled. Use admin session-based endpoints.',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        error: 'Failed to initialize system',
        message: 'Could not create admin user'
      });
    }
    
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({
      error: 'Setup failed',
      message: 'Internal server error during setup'
    });
  }
});

// --- Whitelist Management Endpoints (Admin Only) ---

// Get whitelist status and configuration
app.get('/api/admin/whitelist/status', checkAdminMiddleware, async (req, res) => {
  try {
    const users = await getWhitelistedUsers();
    const admins = await getAdminUsers();
    
    res.json({
      success: true,
      system_status: {
        whitelist_enabled: ENABLE_WHITELIST,
        super_admin_mode: SUPER_ADMIN_MODE,
        setup_key_configured: !!INITIAL_ADMIN_SETUP_KEY
      },
      admin_info: {
        requesting_admin: req.user.identifier,
        total_admins: admins.length,
        admin_users: admins.map(admin => ({
          identifier: admin.substring(0, 3) + '***' + admin.slice(-3),
          is_you: admin === req.user.identifier.toLowerCase()
        }))
      },
      whitelist_info: {
        total_users: users.length,
        whitelisted_users: users.slice(0, 20) // Limit to first 20 for performance
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting whitelist status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get whitelist status'
    });
  }
});

// Add user to whitelist
app.post('/api/admin/whitelist/add', checkAdminMiddleware, async (req, res) => {
  try {
    const { identifier } = req.body;
    
    if (!identifier) {
      return res.status(400).json({
        success: false,
        error: 'User identifier (email or user_id) is required'
      });
    }
    
    const success = await addToWhitelist(identifier);
    
    if (success) {
      const isNewlyAdded = await isUserWhitelisted(identifier);
      res.json({
        success: true,
        message: `User ${identifier} added to whitelist`,
        identifier: identifier.toLowerCase(),
        verified: isNewlyAdded,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to add user to whitelist'
      });
    }
  } catch (error) {
    console.error('Error adding to whitelist:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Remove user from whitelist
app.post('/api/admin/whitelist/remove', checkAdminMiddleware, async (req, res) => {
  try {
    const { identifier } = req.body;
    
    if (!identifier) {
      return res.status(400).json({
        success: false,
        error: 'User identifier (email or user_id) is required'
      });
    }
    
    // Prevent removing admin
    if (identifier.toLowerCase() === ADMIN_EMAIL?.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: 'Cannot remove admin user from whitelist'
      });
    }
    
    const success = await removeFromWhitelist(identifier);
    
    if (success) {
      const stillExists = await isUserWhitelisted(identifier);
      res.json({
        success: true,
        message: `User ${identifier} removed from whitelist`,
        identifier: identifier.toLowerCase(),
        verified: !stillExists,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to remove user from whitelist'
      });
    }
  } catch (error) {
    console.error('Error removing from whitelist:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Bulk add users to whitelist
app.post('/api/admin/whitelist/bulk-add', checkAdminMiddleware, async (req, res) => {
  try {
    const { identifiers } = req.body;
    
    if (!Array.isArray(identifiers) || identifiers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Array of identifiers is required'
      });
    }
    
    const results = [];
    let successCount = 0;
    
    for (const identifier of identifiers) {
      if (identifier && typeof identifier === 'string') {
        const success = await addToWhitelist(identifier);
        results.push({
          identifier: identifier.toLowerCase(),
          success
        });
        if (success) successCount++;
      } else {
        results.push({
          identifier,
          success: false,
          error: 'Invalid identifier'
        });
      }
    }
    
    res.json({
      success: true,
      message: `Bulk add completed: ${successCount}/${identifiers.length} users added`,
      results,
      summary: {
        total: identifiers.length,
        successful: successCount,
        failed: identifiers.length - successCount
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error bulk adding to whitelist:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Check if specific user is whitelisted (useful for testing)
app.get('/api/admin/whitelist/check', checkAdminMiddleware, async (req, res) => {
  try {
    const { identifier } = req.query;
    
    if (!identifier) {
      return res.status(400).json({
        success: false,
        error: 'User identifier is required as query parameter'
      });
    }
    
    const isWhitelisted = await isUserWhitelisted(identifier);
    
    res.json({
      success: true,
      identifier: identifier.toLowerCase(),
      is_whitelisted: isWhitelisted,
      whitelist_enabled: ENABLE_WHITELIST,
      message: isWhitelisted ? 'User is whitelisted' : 'User is not whitelisted',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error checking whitelist:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Add new admin (existing admin required)
app.post('/api/admin/add-admin', checkAdminMiddleware, async (req, res) => {
  try {
    const { identifier } = req.body;
    
    if (!identifier) {
      return res.status(400).json({
        error: 'Admin identifier required',
        message: 'Please provide identifier (email or user_id) for new admin'
      });
    }
    
    // Add as admin and to whitelist
    const adminAdded = await addAdmin(identifier);
    const whitelistAdded = await addToWhitelist(identifier);
    
    if (adminAdded && whitelistAdded) {
      console.log(`New admin added by ${req.user.identifier}: ${identifier}`);
      res.json({
        success: true,
        message: `User ${identifier} is now an admin`,
        added_by: req.user.identifier,
        new_admin: identifier.toLowerCase(),
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        error: 'Failed to add admin',
        message: 'Could not grant admin privileges'
      });
    }
    
  } catch (error) {
    console.error('Error adding admin:', error);
    res.status(500).json({ error: 'Failed to add admin' });
  }
});

// Public endpoint to check whitelist status (no admin required)
app.get('/api/whitelist-info', async (req, res) => {
  try {
    const adminCount = await redisClient.sCard(ADMIN_WHITELIST_KEY);
    const setupRequired = adminCount === 0;
    
    res.json({
      whitelist_enabled: ENABLE_WHITELIST,
      setup_required: setupRequired,
      message: ENABLE_WHITELIST 
        ? (setupRequired 
          ? 'This service requires setup. Please configure initial admin.'
          : 'This service requires user authorization. Please contact support if you need access.')
        : 'This service is open to all users.',
      setup_endpoint: setupRequired ? '/api/admin/setup' : null,
      support_contact: 'Please contact support for access requests.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to get whitelist information'
    });
  }
});

// Test endpoint to verify Gemini API is working
app.get('/api/test/gemini', async (req, res) => {
  try {
    console.log('🧪 Gemini API test endpoint called');
    const result = await testGeminiAPI();
    
    if (result.success) {
      res.json({
        status: 'success',
        message: 'Gemini API is working correctly',
        workingModel: result.workingModel,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: 'Gemini API test failed',
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Gemini test endpoint error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Gemini API test failed with exception',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Zerodha backend API listening on port ${PORT}`);
  console.log(`🔐 Whitelist enabled: ${ENABLE_WHITELIST}`);
  console.log(`⚡ Super admin mode: ${SUPER_ADMIN_MODE || false}`);
  console.log(`🔑 Setup key configured: ${!!INITIAL_ADMIN_SETUP_KEY}`);
  
  if (ENABLE_WHITELIST && !INITIAL_ADMIN_SETUP_KEY) {
    console.log('\n⚠️  WARNING: Whitelist is enabled but no setup key is configured!');
    console.log('💡 Set INITIAL_ADMIN_SETUP_KEY in your environment to enable admin setup');
  }
  
  console.log('\n📖 Admin Setup Instructions:');
  console.log('1. Set INITIAL_ADMIN_SETUP_KEY in your environment');
  console.log('2. POST /api/admin/setup with setup_key and admin_identifier');
  console.log('3. Login as that user and use admin endpoints with session token');
  
  // Test Gemini API on startup
  setTimeout(async () => {
    console.log('\n🚀 Running startup Gemini API test...');
    await testGeminiAPI();
  }, 2000);
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
