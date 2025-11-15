# Stock API Backend

A Node.js backend service for integrating with Zerodha Kite API to fetch stock market data and holdings.

## Features

- OAuth authentication with Zerodha Kite API
- **Google OAuth 2.0 authentication with real user profile data**
- **User Whitelisting & Access Control** - Restrict access to authorized users only
- Fetch user holdings from Zerodha account
- AI-powered stock recommendations using Google Gemini
- Azure Cognitive Search integration for knowledge base
- Redis session management with whitelist storage
- Admin endpoints for user management
- CORS enabled for cross-origin requests
- Comprehensive error handling and logging

## Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd stock-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   - Copy `.env.example` to `.env`
   - Fill in your credentials in `.env`:
     ```bash
     # Zerodha Configuration
     KITE_API_KEY=your_api_key_here
     KITE_API_SECRET=your_api_secret_here
     KITE_REDIRECT_URL=your_redirect_url_here
     
     # Google OAuth 2.0 Configuration
     GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
     GOOGLE_CLIENT_SECRET=your_google_client_secret
     
     # Whitelist Configuration
     ENABLE_WHITELIST=true
     ADMIN_EMAIL=your-admin-email@example.com
     ADMIN_KEY=your-secure-admin-key
     
     # Redis Configuration
     REDIS_URL=redis://localhost:6379
     
     # Server Configuration
     PORT=3001
     ```

4. **Get API Credentials**

   **Zerodha Kite API:**
   - Sign up for a Kite Connect app at [Kite Connect](https://kite.trade/)
   - Get your API key and secret
   - Set the redirect URL to match your deployment URL

   **Google OAuth 2.0:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable Google+ API and Google People API
   - Create OAuth 2.0 credentials (Web application)
   - Add your domain to authorized origins
   - Add `http://localhost:3000` for development

## Usage

1. **Start the server**
   ```bash
   npm start
   ```

2. **API Endpoints**

   **Zerodha Integration:**
   - `GET /api/zerodha/auth/login` - Initiates OAuth login with Zerodha
   - `GET /api/zerodha/auth/callback` - OAuth callback endpoint
   - `GET /api/zerodha/holdings` - Fetch user holdings (requires authentication)
   - `GET /api/zerodha/holdings-ai` - Fetch holdings with AI recommendations or analyze individual stocks
     
     **For Bulk Holdings Analysis:**
     ```
     GET /api/zerodha/holdings-ai?session=token&mode=quick
     ```
     
     **For Individual Stock Analysis:**
     ```
     GET /api/zerodha/holdings-ai?session=token&symbol=RELIANCE.NS&company=Reliance Industries&trading_symbol=RELIANCE&industry=Oil & Gas&current_price=2800&entry_price=2500&stockname=Reliance Industries
     ```
     
     Parameters for individual stock analysis:
     - `symbol` - Yahoo Finance symbol (e.g., RELIANCE.NS)
     - `company` - Company name
     - `stockname` - Alternative company name
     - `trading_symbol` - Trading symbol without exchange suffix
     - `industry` - Industry sector (optional)
     - `current_price` - Current market price
     - `entry_price` - Entry/average price

   **Google OAuth 2.0:**
   - `POST /api/auth/google/token` - Exchange authorization code for access token and user profile
     ```json
     // Request Body:
     {
       "code": "authorization_code_from_google",
       "redirect_uri": "http://localhost:3000/auth/callback"
     }
     
     // Response:
     {
       "success": true,
       "access_token": "google_access_token",
       "user": {
         "user_id": "google_user_id",
         "user_name": "John Doe",
         "email": "john@example.com",
         "picture": "https://profile_picture_url",
         "broker": "google"
       }
     }
     ```

   **Stock Data:**
   - `GET /api/stock-price/:symbol` - Get current stock price
   - `GET /api/stock-details/:symbol` - Get comprehensive stock information

   **User Whitelist Management (Admin Only):**
   - `GET /api/admin/whitelist/status` - Get whitelist status and users
   - `POST /api/admin/whitelist/add` - Add user to whitelist
   - `POST /api/admin/whitelist/remove` - Remove user from whitelist
   - `POST /api/admin/whitelist/bulk-add` - Add multiple users
   - `GET /api/admin/whitelist/check` - Check if user is whitelisted
   - `GET /api/whitelist-info` - Public whitelist status

   **Search & Health:**
   - `GET /api/search` - Query Azure Cognitive Search
   - `GET /health` - Health check endpoint

## User Whitelist & Access Control

The application includes a comprehensive user whitelisting system to restrict access to authorized users only.

### Configuration

**Enable/Disable Whitelist:**
```bash
ENABLE_WHITELIST=true  # Set to false to allow all users
INITIAL_ADMIN_SETUP_KEY=secure-setup-key-123  # One-time key for first admin
SUPER_ADMIN_MODE=false  # Emergency bypass (dev only, never use in production)
```

### How It Works

1. **Initial Setup**: Use `INITIAL_ADMIN_SETUP_KEY` to create the first admin via `/api/admin/setup`
2. **Session-Based Admin**: Admins must log in (Google/Zerodha) and use their session tokens
3. **Dual Storage**: Separate Redis sets for admins (`admin_whitelist`) and users (`user_whitelist`)
4. **Secure Access**: No hardcoded emails or predictable admin keys
5. **Multi-Admin**: Support for multiple administrators with equal privileges

### Admin Management APIs

**🔧 Initial Setup (One-time only):**
```bash
curl -X POST http://localhost:3001/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{"setup_key": "your-setup-key", "admin_identifier": "admin@example.com"}'
```

**All other admin endpoints require admin session token:**

**Add User to Whitelist:**
```bash
curl -X POST http://localhost:3001/api/admin/whitelist/add \
  -H "Content-Type: application/json" \
  -d '{"identifier": "user@example.com", "session_token": "admin-session-token"}'
```

**Add New Admin:**
```bash
curl -X POST http://localhost:3001/api/admin/add-admin \
  -H "Content-Type: application/json" \
  -d '{"identifier": "newadmin@example.com", "session_token": "admin-session-token"}'
```

**Check Status:**
```bash
curl "http://localhost:3001/api/admin/whitelist/status?session=admin-session-token"
```

### User Experience

**For Whitelisted Users:**
- Normal access to all features
- Seamless authentication flow

**For Non-Whitelisted Users:**
- `403 Forbidden` response with clear message
- Instruction to contact support for access

**Error Response Example:**
```json
{
  "error": "Access denied. Your account is not authorized to use this service.",
  "message": "Please contact support to request access.",
  "user_email": "user@example.com",
  "whitelist_enabled": true
}
```

### Protected Endpoints

The following endpoints require whitelisted users:
- `/api/zerodha/holdings` - Stock holdings data
- `/api/zerodha/holdings-ai` - AI-enhanced holdings
- Google OAuth authentication (checks during login)

### Deployment Considerations

- Set strong `ADMIN_KEY` in production
- Use environment variables for configuration
- Monitor Redis storage for whitelist data
- Consider backup/restore procedures for whitelist

## Deployment

This app is configured to deploy on Azure Web Apps. Make sure to set environment variables in your Azure portal instead of using the `.env` file in production.

## Security Notes

- Never commit your `.env` file to git
- Use secure session secrets in production
- Enable HTTPS in production
- Set appropriate CORS origins for your frontend

## Error Handling

The API includes enhanced error handling for common Zerodha API errors:
- 403: Invalid API credentials or checksum
- 409: Request token already used or expired
- 401: User not authenticated

## Dependencies

- Express.js - Web framework
- Axios - HTTP client
- express-session - Session management
- cors - Cross-origin resource sharing
- dotenv - Environment variable loading
- qs - Query string parsing
- crypto - Cryptographic functionality
