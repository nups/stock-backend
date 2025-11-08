# 🚀 Production Whitelist Setup Guide

## Your Production Environment:
- **Frontend**: https://www.stockrecommend.site/
- **Backend API**: https://stockapi3-c6h7ejh2eedabuf6.centralindia-01.azurewebsites.net
- **Azure App Name**: stockapi3-c6h7ejh2eedabuf6

## Step 1: Set Environment Variables in Azure

### Option A: Using Azure Portal
1. Go to Azure Portal → App Services → stockapi3-c6h7ejh2eedabuf6
2. Go to Configuration → Application settings
3. Add these new settings:
   ```
   ENABLE_WHITELIST = true
   INITIAL_ADMIN_SETUP_KEY = your-secure-setup-key-123456
   SUPER_ADMIN_MODE = false
   ```
4. Click Save (app will restart automatically)

### Option B: Using PowerShell (Recommended)
```powershell
# Run this in PowerShell with Azure CLI installed
.\setup-azure-env.ps1
```

## Step 2: Test Your Production API

### Quick Health Check:
```bash
curl https://stockapi3-c6h7ejh2eedabuf6.centralindia-01.azurewebsites.net/health
```

### Check Whitelist Status:
```bash
curl https://stockapi3-c6h7ejh2eedabuf6.centralindia-01.azurewebsites.net/api/whitelist-info
```

## Step 3: Create First Admin

### Using the Setup Script:
```bash
# Set your credentials
export INITIAL_ADMIN_SETUP_KEY="your-secure-setup-key-123456"
export ADMIN_EMAIL="your-email@example.com"

# Run setup
node prod-whitelist-setup.js
```

### Using curl directly:
```bash
curl -X POST https://stockapi3-c6h7ejh2eedabuf6.centralindia-01.azurewebsites.net/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{
    "setup_key": "your-secure-setup-key-123456",
    "admin_identifier": "your-email@example.com"
  }'
```

## Step 4: Login and Get Session Token

1. **For Google OAuth**: Visit your frontend and login with Google
2. **For Zerodha**: Visit https://stockapi3-c6h7ejh2eedabuf6.centralindia-01.azurewebsites.net/api/zerodha/auth/login
3. After login, you'll get a session token from your frontend

## Step 5: Manage Users (Admin Only)

### Add User to Whitelist:
```bash
curl -X POST https://stockapi3-c6h7ejh2eedabuf6.centralindia-01.azurewebsites.net/api/admin/whitelist/add \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "newuser@example.com",
    "session_token": "your-admin-session-token"
  }'
```

### Check Status:
```bash
curl "https://stockapi3-c6h7ejh2eedabuf6.centralindia-01.azurewebsites.net/api/admin/whitelist/status?session=your-admin-session-token"
```

## 🔒 Security Notes for Production:

1. **Strong Setup Key**: Use a long, random setup key
2. **Secure Storage**: Store the setup key securely (you only need it once)
3. **Admin Access**: Only trusted admins should have session tokens
4. **Monitor Logs**: Check Azure App Service logs for authentication attempts
5. **HTTPS Only**: All communication is encrypted via HTTPS

## 🚨 Troubleshooting:

### If setup fails:
- Check Azure App Service logs
- Verify environment variables are set correctly
- Ensure Redis is connected and accessible

### If users can't access:
- Check if they're whitelisted via admin endpoints
- Verify their email/user_id matches exactly
- Check session token validity

### Emergency Access:
- Set `SUPER_ADMIN_MODE=true` temporarily for debugging (logs warnings)
- Never leave SUPER_ADMIN_MODE enabled in production