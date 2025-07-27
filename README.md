# Stock API Backend

A Node.js backend service for integrating with Zerodha Kite API to fetch stock market data and holdings.

## Features

- OAuth authentication with Zerodha Kite API
- Fetch user holdings from Zerodha account
- CORS enabled for cross-origin requests
- Session management for access tokens

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
   - Fill in your Zerodha Kite API credentials in `.env`:
     ```
     KITE_API_KEY=your_api_key_here
     KITE_API_SECRET=your_api_secret_here
     KITE_REDIRECT_URL=your_redirect_url_here
     PORT=3001
     ```

4. **Get Zerodha Kite API Credentials**
   - Sign up for a Kite Connect app at [Kite Connect](https://kite.trade/)
   - Get your API key and secret
   - Set the redirect URL to match your deployment URL

## Usage

1. **Start the server**
   ```bash
   npm start
   ```

2. **API Endpoints**
   - `GET /api/zerodha/auth/login` - Initiates OAuth login with Zerodha
   - `GET /api/zerodha/auth/callback` - OAuth callback endpoint
   - `GET /api/zerodha/holdings` - Fetch user holdings (requires authentication)

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
