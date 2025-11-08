# Quick User Management Script
# Replace YOUR_SESSION_TOKEN with your actual session token

$SESSION_TOKEN = "92c2e5d750ce5cf1d4ba899f678c8876af5e6cdc31638b1c3da57c837dd2134e"
$API_URL = "https://stockapi3-c6h7ejh2eedabuf6.centralindia-01.azurewebsites.net"

Write-Host "🔧 Production Whitelist Management" -ForegroundColor Green
Write-Host "Session: $($SESSION_TOKEN.Substring(0, [Math]::Min(8, $SESSION_TOKEN.Length)))..." -ForegroundColor Cyan
Write-Host "─" * 50

# Function to get status
function Get-WhitelistStatus {
    Write-Host "📊 Getting current status..." -ForegroundColor Yellow
    try {
        $response = Invoke-RestMethod -Uri "$API_URL/api/admin/whitelist/status?session=$SESSION_TOKEN" -Method GET
        Write-Host "✅ Status retrieved:" -ForegroundColor Green
        return $response
    } catch {
        Write-Host "❌ Failed to get status: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Function to add user
function Add-User {
    param([string]$Email)
    Write-Host "➕ Adding user: $Email" -ForegroundColor Yellow
    try {
        $body = @{
            identifier = $Email
            session_token = $SESSION_TOKEN
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri "$API_URL/api/admin/whitelist/add" -Method POST -Body $body -ContentType "application/json"
        Write-Host "✅ User added successfully!" -ForegroundColor Green
        return $response
    } catch {
        Write-Host "❌ Failed to add user: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Function to check user
function Check-User {
    param([string]$Email)
    Write-Host "🔍 Checking user: $Email" -ForegroundColor Yellow
    try {
        $response = Invoke-RestMethod -Uri "$API_URL/api/admin/whitelist/check?identifier=$Email&session=$SESSION_TOKEN" -Method GET
        Write-Host "✅ Check completed!" -ForegroundColor Green
        return $response
    } catch {
        Write-Host "❌ Failed to check user: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Main menu
Write-Host "`n🎯 What would you like to do?" -ForegroundColor Blue
Write-Host "1. Get current status"
Write-Host "2. Add a user"
Write-Host "3. Check if user is whitelisted"
Write-Host "4. Add multiple users"

$choice = Read-Host "`nEnter your choice (1-4)"

switch ($choice) {
    "1" {
        $status = Get-WhitelistStatus
        if ($status) {
            $status | ConvertTo-Json -Depth 3 | Write-Host
        }
    }
    "2" {
        $email = Read-Host "Enter user email to add"
        $result = Add-User -Email $email
        if ($result) {
            $result | ConvertTo-Json -Depth 2 | Write-Host
        }
    }
    "3" {
        $email = Read-Host "Enter user email to check"
        $result = Check-User -Email $email
        if ($result) {
            $result | ConvertTo-Json -Depth 2 | Write-Host
        }
    }
    "4" {
        Write-Host "Enter user emails separated by commas:"
        $emails = Read-Host "Emails"
        $emailList = $emails -split "," | ForEach-Object { $_.Trim() }
        
        Write-Host "📦 Adding $($emailList.Count) users..." -ForegroundColor Yellow
        foreach ($email in $emailList) {
            if ($email) {
                Add-User -Email $email
                Start-Sleep -Seconds 1
            }
        }
    }
    default {
        Write-Host "Invalid choice. Please run the script again." -ForegroundColor Red
    }
}

Write-Host "`n🎉 Done!" -ForegroundColor Green