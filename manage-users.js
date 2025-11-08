#!/usr/bin/env node

/**
 * Production User Management Script
 * Usage: node manage-users.js [add|remove|status|check] [email] [session_token]
 */

const axios = require('axios');

const PROD_API_URL = 'https://stockapi3-c6h7ejh2eedabuf6.centralindia-01.azurewebsites.net';

async function manageUsers(action, identifier, sessionToken) {
  console.log(`🔧 Managing users in production...`);
  console.log(`Action: ${action}`);
  console.log(`User: ${identifier || 'N/A'}`);
  console.log(`Session: ${sessionToken ? sessionToken.substring(0, 8) + '...' : 'N/A'}`);
  console.log('─'.repeat(60));

  try {
    switch (action) {
      case 'status':
        await getStatus(sessionToken);
        break;
      case 'add':
        await addUser(identifier, sessionToken);
        break;
      case 'remove':
        await removeUser(identifier, sessionToken);
        break;
      case 'check':
        await checkUser(identifier, sessionToken);
        break;
      case 'bulk-add':
        await bulkAddUsers(identifier.split(','), sessionToken);
        break;
      default:
        showUsage();
    }
  } catch (error) {
    console.error('❌ Operation failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', error.response.data);
    }
  }
}

async function getStatus(sessionToken) {
  console.log('📊 Getting whitelist status...');
  const response = await axios.get(`${PROD_API_URL}/api/admin/whitelist/status`, {
    params: { session: sessionToken }
  });
  
  console.log('✅ Status retrieved:');
  console.log(JSON.stringify(response.data, null, 2));
}

async function addUser(identifier, sessionToken) {
  console.log(`➕ Adding user: ${identifier}`);
  const response = await axios.post(`${PROD_API_URL}/api/admin/whitelist/add`, {
    identifier,
    session_token: sessionToken
  });
  
  console.log('✅ User added successfully:');
  console.log(JSON.stringify(response.data, null, 2));
}

async function removeUser(identifier, sessionToken) {
  console.log(`➖ Removing user: ${identifier}`);
  const response = await axios.post(`${PROD_API_URL}/api/admin/whitelist/remove`, {
    identifier,
    session_token: sessionToken
  });
  
  console.log('✅ User removed successfully:');
  console.log(JSON.stringify(response.data, null, 2));
}

async function checkUser(identifier, sessionToken) {
  console.log(`🔍 Checking user: ${identifier}`);
  const response = await axios.get(`${PROD_API_URL}/api/admin/whitelist/check`, {
    params: { 
      identifier,
      session: sessionToken 
    }
  });
  
  console.log('✅ Check result:');
  console.log(JSON.stringify(response.data, null, 2));
}

async function bulkAddUsers(identifiers, sessionToken) {
  console.log(`📦 Bulk adding ${identifiers.length} users...`);
  const response = await axios.post(`${PROD_API_URL}/api/admin/whitelist/bulk-add`, {
    identifiers,
    session_token: sessionToken
  });
  
  console.log('✅ Bulk add completed:');
  console.log(JSON.stringify(response.data, null, 2));
}

function showUsage() {
  console.log('📖 Usage Examples:');
  console.log('');
  console.log('# Get status');
  console.log('node manage-users.js status "" "your-session-token"');
  console.log('');
  console.log('# Add single user');
  console.log('node manage-users.js add "user@example.com" "your-session-token"');
  console.log('');
  console.log('# Remove user');
  console.log('node manage-users.js remove "user@example.com" "your-session-token"');
  console.log('');
  console.log('# Check if user is whitelisted');
  console.log('node manage-users.js check "user@example.com" "your-session-token"');
  console.log('');
  console.log('# Bulk add users (comma-separated)');
  console.log('node manage-users.js bulk-add "user1@example.com,user2@example.com" "your-session-token"');
  console.log('');
  console.log('💡 First login at https://www.stockrecommend.site/ to get your session token');
}

// Run if called directly
if (require.main === module) {
  const [,, action, identifier, sessionToken] = process.argv;
  
  if (!action) {
    showUsage();
    process.exit(1);
  }
  
  manageUsers(action, identifier, sessionToken);
}

module.exports = { manageUsers };