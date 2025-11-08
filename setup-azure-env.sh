#!/bin/bash
# Azure CLI commands to set production environment variables
# Replace YOUR_APP_NAME and YOUR_RESOURCE_GROUP with your actual values

APP_NAME="stockapi3-c6h7ejh2eedabuf6"  # Your Azure Web App name
RESOURCE_GROUP="your-resource-group"   # Replace with your resource group

# Enable whitelist system
az webapp config appsettings set --name $APP_NAME --resource-group $RESOURCE_GROUP --settings \
    ENABLE_WHITELIST=true \
    INITIAL_ADMIN_SETUP_KEY="secure-prod-setup-$(date +%s)" \
    SUPER_ADMIN_MODE=false

# If you need Google OAuth (replace with your actual values)
# az webapp config appsettings set --name $APP_NAME --resource-group $RESOURCE_GROUP --settings \
#     GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com" \
#     GOOGLE_CLIENT_SECRET="your-google-client-secret"

# If you need Azure Search (replace with your actual values)
# az webapp config appsettings set --name $APP_NAME --resource-group $RESOURCE_GROUP --settings \
#     AZURE_SEARCH_ENDPOINT="https://your-search-service.search.windows.net" \
#     AZURE_SEARCH_INDEX="your-search-index" \
#     AZURE_SEARCH_QUERY_KEY="your-search-query-key"

echo "Environment variables set successfully!"
echo "App will restart automatically to pick up new settings."