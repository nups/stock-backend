# Stock API Backend

A Node.js backend service for integrating with Zerodha Kite API to fetch stock market data and holdings.

## Features

- OAuth authentication with Zerodha Kite API
- **Google OAuth 2.0 authentication with real user profile data**
- Fetch user holdings from Zerodha account
- AI-powered stock recommendations using Google Gemini
- Azure Cognitive Search integration for knowledge base
- Redis session management
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
   - `GET /api/zerodha/holdings-ai` - Fetch holdings with AI recommendations

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

   **Search & Health:**
   - `GET /api/search` - Query Azure Cognitive Search
   - `GET /health` - Health check endpoint

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
