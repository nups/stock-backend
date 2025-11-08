# PowerShell script to manage whitelist users in production
# Usage: .\manage-users.ps1 -Action [add|remove|status|check] -User [email] -SessionToken [token]

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("add", "remove", "status", "check", "bulk-add")]
    [string]$Action,
    
    [string]$User,
    
    [Parameter(Mandatory=$true)]
    [string]$SessionToken
)

$PROD_API_URL = "https://stockapi3-c6h7ejh2eedabuf6.centralindia-01.azurewebsites.net"

Write-Host "🔧 Managing Production Whitelist" -ForegroundColor Green
Write-Host "Action: $Action" -ForegroundColor Cyan
Write-Host "User: $User" -ForegroundColor Cyan
Write-Host "Session: $($SessionToken.Substring(0, [Math]::Min(8, $SessionToken.Length)))..." -ForegroundColor Cyan
Write-Host "─" * 60

try {
    switch ($Action) {
        "status" {
            Write-Host "📊 Getting whitelist status..." -ForegroundColor Yellow
            $response = Invoke-RestMethod -Uri "$PROD_API_URL/api/admin/whitelist/status?session=$SessionToken" -Method GET
            Write-Host "✅ Status retrieved:" -ForegroundColor Green
            $response | ConvertTo-Json -Depth 5 | Write-Host
        }
        
        "add" {
            if (-not $User) { throw "User email is required for add action" }
            Write-Host "➕ Adding user: $User" -ForegroundColor Yellow
            $body = @{
                identifier = $User
                session_token = $SessionToken
            } | ConvertTo-Json
            
            $response = Invoke-RestMethod -Uri "$PROD_API_URL/api/admin/whitelist/add" -Method POST -Body $body -ContentType "application/json"
            Write-Host "✅ User added successfully:" -ForegroundColor Green
            $response | ConvertTo-Json -Depth 3 | Write-Host
        }
        
        "remove" {
            if (-not $User) { throw "User email is required for remove action" }
            Write-Host "➖ Removing user: $User" -ForegroundColor Yellow
            $body = @{
                identifier = $User
                session_token = $SessionToken
            } | ConvertTo-Json
            
            $response = Invoke-RestMethod -Uri "$PROD_API_URL/api/admin/whitelist/remove" -Method POST -Body $body -ContentType "application/json"
            Write-Host "✅ User removed successfully:" -ForegroundColor Green
            $response | ConvertTo-Json -Depth 3 | Write-Host
        }
        
        "check" {
            if (-not $User) { throw "User email is required for check action" }
            Write-Host "🔍 Checking user: $User" -ForegroundColor Yellow
            $response = Invoke-RestMethod -Uri "$PROD_API_URL/api/admin/whitelist/check?identifier=$User&session=$SessionToken" -Method GET
            Write-Host "✅ Check result:" -ForegroundColor Green
            $response | ConvertTo-Json -Depth 3 | Write-Host
        }
        
        "bulk-add" {
            if (-not $User) { throw "Comma-separated user emails are required for bulk-add action" }
            $users = $User -split ","
            Write-Host "📦 Bulk adding $($users.Count) users..." -ForegroundColor Yellow
            $body = @{
                identifiers = $users
                session_token = $SessionToken
            } | ConvertTo-Json
            
            $response = Invoke-RestMethod -Uri "$PROD_API_URL/api/admin/whitelist/bulk-add" -Method POST -Body $body -ContentType "application/json"
            Write-Host "✅ Bulk add completed:" -ForegroundColor Green
            $response | ConvertTo-Json -Depth 3 | Write-Host
        }
    }
    
    Write-Host "`n🎉 Operation completed successfully!" -ForegroundColor Green
    
} catch {
    Write-Host "❌ Operation failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
        # Try to read error details
        try {
            $errorStream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($errorStream)
            $errorDetails = $reader.ReadToEnd()
            Write-Host "Error Details: $errorDetails" -ForegroundColor Red
        } catch {
            Write-Host "Could not read error details" -ForegroundColor Red
        }
    }
}

Write-Host "`n💡 Usage Examples:" -ForegroundColor Blue
Write-Host "Get status:    .\manage-users.ps1 -Action status -SessionToken 'your-token'" -ForegroundColor Gray
Write-Host "Add user:      .\manage-users.ps1 -Action add -User 'user@example.com' -SessionToken 'your-token'" -ForegroundColor Gray
Write-Host "Check user:    .\manage-users.ps1 -Action check -User 'user@example.com' -SessionToken 'your-token'" -ForegroundColor Gray
Write-Host "Bulk add:      .\manage-users.ps1 -Action bulk-add -User 'user1@email.com,user2@email.com' -SessionToken 'your-token'" -ForegroundColor Gray