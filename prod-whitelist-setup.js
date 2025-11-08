#!/usr/bin/env node

/**
 * Production Whitelist Setup and Testing Script
 * Usage: node prod-whitelist-setup.js
 */

const axios = require('axios');

// Production Configuration
const PROD_API_URL = 'https://stockapi3-c6h7ejh2eedabuf6.centralindia-01.azurewebsites.net';
const PROD_FRONTEND_URL = 'https://www.stockrecommend.site';
const SETUP_KEY = process.env.INITIAL_ADMIN_SETUP_KEY || 'your-setup-key-here';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'your-admin-email@example.com';

async function setupProductionWhitelist() {
  console.log('🚀 Production Whitelist Setup for Stock Recommend');
  console.log(`Frontend URL: ${PROD_FRONTEND_URL}`);
  console.log(`Backend API URL: ${PROD_API_URL}`);
  console.log('─'.repeat(60));

  try {
    // Step 1: Check if production app is running
    console.log('\n1️⃣ Checking production app health...');
    try {
      const healthResponse = await axios.get(`${PROD_API_URL}/health`, { timeout: 10000 });
      console.log('✅ Production app is healthy:', healthResponse.data.status);
    } catch (error) {
      console.log('❌ Production app health check failed:', error.message);
      console.log('💡 Make sure your app is deployed and running');
      return;
    }

    // Step 2: Check whitelist status
    console.log('\n2️⃣ Checking whitelist configuration...');
    try {
      const infoResponse = await axios.get(`${PROD_API_URL}/api/whitelist-info`);
      console.log('✅ Whitelist info:', {
        enabled: infoResponse.data.whitelist_enabled,
        setup_required: infoResponse.data.setup_required,
        message: infoResponse.data.message
      });

      if (!infoResponse.data.whitelist_enabled) {
        console.log('⚠️  Whitelist is not enabled in production!');
        console.log('💡 Set ENABLE_WHITELIST=true in Azure App Settings');
        return;
      }

      if (!infoResponse.data.setup_required) {
        console.log('ℹ️  System is already initialized with admin users');
        console.log('💡 Use existing admin session tokens for management');
        return;
      }

    } catch (error) {
      console.log('❌ Could not check whitelist status:', error.message);
      return;
    }

    // Step 3: Initial admin setup
    if (!SETUP_KEY) {
      console.log('\n❌ INITIAL_ADMIN_SETUP_KEY is required');
      console.log('💡 Set this environment variable or pass it as argument');
      return;
    }

    if (!ADMIN_EMAIL) {
      console.log('\n❌ Admin email is required');
      console.log('💡 Provide admin email as environment variable or argument');
      return;
    }

    console.log(`\n3️⃣ Setting up initial admin: ${ADMIN_EMAIL}`);
    try {
      const setupResponse = await axios.post(`${PROD_API_URL}/api/admin/setup`, {
        setup_key: SETUP_KEY,
        admin_identifier: ADMIN_EMAIL
      });

      console.log('🎉 Admin setup successful!', setupResponse.data);
      console.log('\n📋 Next Steps:');
      console.log('1. Login to your app using Google OAuth or Zerodha');
      console.log('2. Use the session token for admin operations');
      console.log('3. Add other users to whitelist via admin endpoints');

    } catch (error) {
      if (error.response?.status === 403) {
        console.log('❌ Invalid setup key');
        console.log('💡 Make sure INITIAL_ADMIN_SETUP_KEY matches Azure App Settings');
      } else if (error.response?.status === 409) {
        console.log('ℹ️  System is already initialized');
        console.log('💡 Use existing admin accounts for management');
      } else {
        console.log('❌ Setup failed:', error.response?.data?.error || error.message);
      }
    }

    // Step 4: Test basic endpoints
    console.log('\n4️⃣ Testing protected endpoints...');
    try {
      const holdingsResponse = await axios.get(`${PROD_API_URL}/api/zerodha/holdings`);
      console.log('❌ Unexpected: Holdings endpoint should require authentication');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Holdings endpoint properly protected');
      } else {
        console.log('⚠️  Holdings endpoint error:', error.response?.status);
      }
    }

    console.log('\n🎉 Production setup completed!');
    console.log('─'.repeat(60));
    console.log('🔗 Useful URLs:');
    console.log(`   Frontend: ${PROD_FRONTEND_URL}`);
    console.log(`   API Health: ${PROD_API_URL}/health`);
    console.log(`   Whitelist Info: ${PROD_API_URL}/api/whitelist-info`);
    console.log(`   Zerodha Login: ${PROD_API_URL}/api/zerodha/auth/login`);

  } catch (error) {
    console.error('\n💥 Setup failed:', error.message);
  }
}

// Simple prompt function for Node.js
function prompt(question) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Run setup if script is executed directly
if (require.main === module) {
  setupProductionWhitelist();
}

module.exports = { setupProductionWhitelist };