# PowerShell script to create a distribution zip file for the Sentry Span Optimizer extension

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExtensionName = "sentry-span-optimizer"
$Version = Get-Date -Format "yyyyMMdd"

Write-Host "Creating distribution zip for $ExtensionName..." -ForegroundColor Green

# Create releases directory if it doesn't exist
$ReleasesDir = Join-Path $ScriptDir "releases"
if (-not (Test-Path $ReleasesDir)) {
    New-Item -ItemType Directory -Path $ReleasesDir | Out-Null
}

# Change to script directory
Set-Location $ScriptDir

# Get all files except excluded ones
$FilesToZip = Get-ChildItem -Path . -Recurse | Where-Object {
    $_.FullName -notmatch '\.git' -and
    $_.FullName -notmatch '\.DS_Store' -and
    $_.FullName -notmatch '\.zip$' -and
    $_.FullName -notmatch 'node_modules' -and
    $_.FullName -notmatch '\.vscode' -and
    $_.FullName -notmatch '\.idea' -and
    $_.FullName -notmatch '\.log$' -and
    $_.FullName -notmatch 'create-release' -and
    $_.FullName -notmatch 'releases'
}

# Create zip file
$ZipPath = Join-Path $ReleasesDir "${ExtensionName}-${Version}.zip"
Compress-Archive -Path $FilesToZip -DestinationPath $ZipPath -Force

Write-Host ""
Write-Host "✓ Created: $ZipPath" -ForegroundColor Green
Write-Host ""
Write-Host "To install:" -ForegroundColor Yellow
Write-Host "1. Extract the zip file"
Write-Host "2. Open Chrome: chrome://extensions/ → Enable Developer mode → Load unpacked"
Write-Host "3. Select the extracted folder"
Write-Host ""


