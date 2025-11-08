# PowerShell script to set Azure Web App environment variables
# Run this in PowerShell with Azure CLI installed

$APP_NAME = "stockapi3-c6h7ejh2eedabuf6"  # Your Azure Web App name
$RESOURCE_GROUP = "your-resource-group"    # Replace with your actual resource group

# Generate a secure setup key
$SETUP_KEY = "secure-prod-setup-$(Get-Date -Format 'yyyyMMddHHmmss')"

Write-Host "Setting up whitelist environment variables..." -ForegroundColor Green

# Set whitelist configuration
az webapp config appsettings set --name $APP_NAME --resource-group $RESOURCE_GROUP --settings `
    ENABLE_WHITELIST=true `
    INITIAL_ADMIN_SETUP_KEY=$SETUP_KEY `
    SUPER_ADMIN_MODE=false

Write-Host "✅ Environment variables set successfully!" -ForegroundColor Green
Write-Host "🔑 Your setup key is: $SETUP_KEY" -ForegroundColor Yellow
Write-Host "⚠️  Save this setup key securely - you'll need it to create the first admin!" -ForegroundColor Red
Write-Host "🔄 App will restart automatically to pick up new settings." -ForegroundColor Blue

# Optional: Get the current app URL
$APP_URL = az webapp show --name $APP_NAME --resource-group $RESOURCE_GROUP --query "defaultHostName" --output tsv
Write-Host "🌐 Your app URL: https://$APP_URL" -ForegroundColor Cyan