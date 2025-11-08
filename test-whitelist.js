#!/usr/bin/env node

/**
 * Whitelist Testing Script
 * 
 * This script helps test the whitelist functionality.
 * Usage: node test-whitelist.js
 */

const axios = require('axios');

// Configuration
const BASE_URL = process.env.API_URL || 'http://localhost:3001';
const SETUP_KEY = process.env.INITIAL_ADMIN_SETUP_KEY || 'test-setup-key-123';
const TEST_EMAIL = 'test-user@example.com';
const TEST_ADMIN_EMAIL = 'test-admin@example.com';

async function testWhitelistFunctionality() {
  console.log('🧪 Testing NEW Secure Whitelist System\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Setup Key: ${SETUP_KEY.substring(0, 8)}...`);
  console.log('─'.repeat(50));

  try {
    // Test 1: Check whitelist info (public endpoint)
    console.log('\n1️⃣ Testing public whitelist info...');
    const infoResponse = await axios.get(`${BASE_URL}/api/whitelist-info`);
    console.log('✅ Whitelist Info:', infoResponse.data);

    // Test 2: Try initial admin setup
    console.log('\n2️⃣ Testing initial admin setup...');
    try {
      const setupResponse = await axios.post(`${BASE_URL}/api/admin/setup`, {
        setup_key: SETUP_KEY,
        admin_identifier: TEST_ADMIN_EMAIL
      });
      console.log('✅ Admin setup:', setupResponse.data);
    } catch (error) {
      if (error.response?.status === 409) {
        console.log('ℹ️  System already initialized (expected after first run)');
      } else {
        console.log('❌ Setup failed:', error.response?.data?.error || error.message);
        console.log('💡 Make sure INITIAL_ADMIN_SETUP_KEY matches in your .env file');
      }
    }

    // Test 3: Add test user to whitelist
    console.log(`\n3️⃣ Adding test user to whitelist: ${TEST_EMAIL}`);
    try {
      const addResponse = await axios.post(`${BASE_URL}/api/admin/whitelist/add`, {
        identifier: TEST_EMAIL,
        admin_key: ADMIN_KEY
      });
      console.log('✅ User added:', addResponse.data);
    } catch (error) {
      console.log('❌ Failed to add user:', error.response?.data?.error || error.message);
    }

    // Test 4: Check if test user is whitelisted
    console.log(`\n4️⃣ Checking if test user is whitelisted...`);
    try {
      const checkResponse = await axios.get(`${BASE_URL}/api/admin/whitelist/check?identifier=${TEST_EMAIL}&admin_key=${ADMIN_KEY}`);
      console.log('✅ Check result:', checkResponse.data);
    } catch (error) {
      console.log('❌ Failed to check user:', error.response?.data?.error || error.message);
    }

    // Test 5: Test protected endpoint without session (should fail)
    console.log(`\n5️⃣ Testing protected endpoint without authentication...`);
    try {
      const holdingsResponse = await axios.get(`${BASE_URL}/api/zerodha/holdings`);
      console.log('❌ Unexpected success - endpoint should require authentication');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Correctly blocked - authentication required');
      } else {
        console.log('⚠️ Different error:', error.response?.data?.error || error.message);
      }
    }

    // Test 6: Remove test user from whitelist
    console.log(`\n6️⃣ Removing test user from whitelist...`);
    try {
      const removeResponse = await axios.post(`${BASE_URL}/api/admin/whitelist/remove`, {
        identifier: TEST_EMAIL,
        admin_key: ADMIN_KEY
      });
      console.log('✅ User removed:', removeResponse.data);
    } catch (error) {
      console.log('❌ Failed to remove user:', error.response?.data?.error || error.message);
    }

    // Test 7: Final status check
    console.log(`\n7️⃣ Final whitelist status...`);
    try {
      const finalStatusResponse = await axios.get(`${BASE_URL}/api/admin/whitelist/status?admin_key=${ADMIN_KEY}`);
      console.log('✅ Final Status:', {
        enabled: finalStatusResponse.data.whitelist_enabled,
        count: finalStatusResponse.data.whitelisted_users_count
      });
    } catch (error) {
      console.log('❌ Failed to get final status:', error.response?.data?.error || error.message);
    }

    console.log('\n🎉 Whitelist testing completed!');
    console.log('─'.repeat(50));
    console.log('💡 Tips:');
    console.log('  - Set ENABLE_WHITELIST=true in .env to activate whitelist');
    console.log('  - Set ADMIN_KEY to a secure value in production');
    console.log('  - Monitor Redis for whitelist data: SET user_whitelist');

  } catch (error) {
    console.log('\n❌ Test suite failed:', error.message);
    console.log('💡 Make sure your server is running on', BASE_URL);
  }
}

// Run tests if script is executed directly
if (require.main === module) {
  testWhitelistFunctionality();
}

module.exports = { testWhitelistFunctionality };