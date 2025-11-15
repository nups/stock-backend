// Test script for stock data enrichment functions
const yahooFinance = require('yahoo-finance2').default;

/**
 * Fetch fundamental data from Yahoo Finance
 */
async function fetchFundamentalData(symbol) {
  try {
    console.log(`📊 Fetching fundamental data for ${symbol}...`);
    
    // Add .NS suffix for NSE stocks if not present
    const yahooSymbol = symbol.includes('.') ? symbol : `${symbol}.NS`;
    
    // Fetch quote summary with all available modules
    const quote = await yahooFinance.quoteSummary(yahooSymbol, {
      modules: ['summaryDetail', 'financialData', 'defaultKeyStatistics', 'summaryProfile']
    });
    
    const fundamentals = {
      marketCap: quote.summaryDetail?.marketCap || null,
      peRatio: quote.summaryDetail?.trailingPE || null,
      pbRatio: quote.defaultKeyStatistics?.priceToBook || null,
      dividendYield: quote.summaryDetail?.dividendYield || null,
      roe: quote.financialData?.returnOnEquity || null,
      debtToEquity: quote.financialData?.debtToEquity || null,
      currentRatio: quote.financialData?.currentRatio || null,
      profitMargin: quote.financialData?.profitMargins || null,
      revenueGrowth: quote.financialData?.revenueGrowth || null,
      earningsGrowth: quote.financialData?.earningsGrowth || null,
      targetMeanPrice: quote.financialData?.targetMeanPrice || null,
      recommendationKey: quote.financialData?.recommendationKey || null,
      fiftyTwoWeekHigh: quote.summaryDetail?.fiftyTwoWeekHigh || null,
      fiftyTwoWeekLow: quote.summaryDetail?.fiftyTwoWeekLow || null,
      sector: quote.summaryProfile?.sector || null,
      industry: quote.summaryProfile?.industry || null,
      beta: quote.summaryDetail?.beta || null
    };
    
    console.log(`✅ Fundamental data fetched for ${symbol}`);
    return fundamentals;
    
  } catch (error) {
    console.error(`❌ Error fetching fundamental data for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Fetch technical indicators from Yahoo Finance
 */
async function fetchTechnicalData(symbol) {
  try {
    console.log(`📈 Fetching technical data for ${symbol}...`);
    
    const yahooSymbol = symbol.includes('.') ? symbol : `${symbol}.NS`;
    
    // Fetch historical data for last 3 months
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);
    
    const history = await yahooFinance.historical(yahooSymbol, {
      period1: startDate,
      period2: endDate,
      interval: '1wk' // Weekly data
    });
    
    if (!history || history.length === 0) {
      return null;
    }
    
    // Calculate basic technical indicators
    const prices = history.map(d => d.close);
    const volumes = history.map(d => d.volume);
    const latestPrice = prices[prices.length - 1];
    
    // Simple Moving Averages
    const sma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, prices.length);
    const sma50 = prices.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, prices.length);
    
    // Price momentum
    const priceChange1w = ((prices[prices.length - 1] - prices[prices.length - 2]) / prices[prices.length - 2] * 100);
    const priceChange4w = ((prices[prices.length - 1] - prices[prices.length - 5]) / prices[prices.length - 5] * 100);
    
    // Volume trend
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const latestVolume = volumes[volumes.length - 1];
    const volumeTrend = ((latestVolume - avgVolume) / avgVolume * 100);
    
    const technical = {
      sma20,
      sma50,
      priceAboveSMA20: latestPrice > sma20,
      priceAboveSMA50: latestPrice > sma50,
      priceChange1Week: priceChange1w,
      priceChange4Week: priceChange4w,
      volumeTrend,
      avgVolume,
      trend: latestPrice > sma20 && latestPrice > sma50 ? 'UPTREND' : 
             latestPrice < sma20 && latestPrice < sma50 ? 'DOWNTREND' : 'NEUTRAL'
    };
    
    console.log(`✅ Technical data fetched for ${symbol}`);
    return technical;
    
  } catch (error) {
    console.error(`❌ Error fetching technical data for ${symbol}:`, error.message);
    return null;
  }
}

// Test with sample stocks
async function testEnrichment() {
  console.log('🧪 Testing stock data enrichment...\n');
  
  const testStocks = ['RELIANCE', 'TCS', 'INFY'];
  
  for (const symbol of testStocks) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${symbol}`);
    console.log('='.repeat(60));
    
    const [fundamentals, technicals] = await Promise.all([
      fetchFundamentalData(symbol),
      fetchTechnicalData(symbol)
    ]);
    
    console.log('\n📊 FUNDAMENTAL DATA:');
    console.log(JSON.stringify(fundamentals, null, 2));
    
    console.log('\n📈 TECHNICAL DATA:');
    console.log(JSON.stringify(technicals, null, 2));
  }
  
  console.log('\n\n✅ Test completed!');
}

// Run the test
testEnrichment().catch(console.error);
