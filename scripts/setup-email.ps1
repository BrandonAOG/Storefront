# Sets up email sending for the storefront through Resend.
# Safe to run as many times as you like: it reuses the domain if it already exists.
#
# Run it with:
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-email.ps1
#
# The API key is only held in memory while this script runs. It is not saved or printed.

$ErrorActionPreference = "Stop"
$domainName = "alwaysongenerators.com"

Write-Host ""
Write-Host "Paste your Resend API key (from resend.com > API Keys), then press Enter."
Write-Host "Nothing will show as you paste. That is normal."
$secure = Read-Host "Resend API key" -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()

if (-not $key.StartsWith("re_")) {
    Write-Host ""
    Write-Host "That does not look like a Resend key (they start with re_). Nothing was changed." -ForegroundColor Red
    Write-Host "Run the script again and paste only the key."
    exit 1
}

$headers = @{ Authorization = "Bearer $key" }
$api = "https://api.resend.com/domains"

try {
    $existing = (Invoke-RestMethod -Uri $api -Headers $headers).data | Where-Object { $_.name -eq $domainName }
} catch {
    Write-Host ""
    Write-Host "Resend rejected the key. Check it was copied in full, or create a new key with Full access." -ForegroundColor Red
    Write-Host $_.ErrorDetails.Message
    exit 1
}

if ($existing) {
    Write-Host ""
    Write-Host "$domainName is already registered with Resend."
    $id = $existing.id
} else {
    $body = @{ name = $domainName } | ConvertTo-Json
    $created = Invoke-RestMethod -Method Post -Uri $api -Headers $headers -ContentType "application/json" -Body $body
    $id = $created.id
    Write-Host ""
    Write-Host "Registered $domainName with Resend."
}

# Ask Resend to check the DNS records now (harmless if they are not there yet).
try { Invoke-RestMethod -Method Post -Uri "$api/$id/verify" -Headers $headers | Out-Null } catch { }
Start-Sleep -Seconds 3
$domain = Invoke-RestMethod -Uri "$api/$id" -Headers $headers

Write-Host ""
Write-Host "===== DNS RECORDS TO ADD =====" -ForegroundColor Yellow
$domain.records | Format-List record, type, name, value, priority, status

Write-Host "===== WHO HOSTS YOUR DNS =====" -ForegroundColor Yellow
try {
    Resolve-DnsName $domainName -Type NS | Where-Object { $_.NameHost } | ForEach-Object { Write-Host $_.NameHost }
} catch {
    Write-Host "Could not look this up."
}

Write-Host ""
Write-Host "===== DOMAIN STATUS: $($domain.status) =====" -ForegroundColor Yellow
if ($domain.status -eq "verified") {
    Write-Host "Verified. Email can be switched on."
} else {
    Write-Host "Not verified yet. Add the records above at your DNS host, wait a while, then run this script again."
}
Write-Host ""
