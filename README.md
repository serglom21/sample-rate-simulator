# Sentry Span Optimizer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Chrome/Firefox browser extension (Manifest V3) that helps Sentry customers model cost and usage optimization by simulating different sampling rates on their live Sentry data.

## Features

- **Secure Authentication**: Uses your browser session cookies (no token needed!)
- **Automatic Organization Detection**: Automatically detects the organization from any open Sentry tab
- **Project Selection**: Filter data by specific projects or view all projects
- **Flexible Date Ranges**: Query data for the last 7, 30, or 90 days
- **Advanced Sampling Rules**: Create custom rules based on multiple span attributes (operation, description, status, domain, action, module, system, transaction, environment, release)
- **Multiple Match Operators**: Use contains, equals, starts with, ends with, or regex matching
- **Cost Optimization Modeling**: Simulate different sampling rates and expansion factors
- **Monthly Projections**: See projected monthly usage based on your selected time period
- **Visual Results**: See baseline vs optimized usage with cost reduction percentages
- **Detailed Breakdown**: Searchable, paginated breakdown of all span groups

## Installation

### Option 1: Install from Source (Recommended for Development)

1. **Clone or download this repository**:
   ```bash
   git clone https://github.com/serglom21/sample-rate-simulator.git
   cd sample-rate-simulator
   ```

2. **Install in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `sample-rate-extension` directory

3. **Install in Firefox**:
   - Open Firefox and navigate to `about:debugging`
   - Click "This Firefox"
   - Click "Load Temporary Add-on"
   - Select the `manifest.json` file from the `sample-rate-extension` directory

### Option 2: Install from Zip File (Easiest)

1. **Download the latest release**:
   - Download `sentry-span-optimizer.zip` from the [Releases](https://github.com/serglom21/sample-rate-simulator/releases) page
   - Or create your own zip file using the script (see below)

2. **Extract the zip file**:
   - Extract the contents to a folder (e.g., `sentry-span-optimizer`)

3. **Install in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the extracted `sentry-span-optimizer` folder

4. **Install in Firefox**:
   - Open Firefox and navigate to `about:debugging`
   - Click "This Firefox"
   - Click "Load Temporary Add-on"
   - Select the `manifest.json` file from the extracted folder

### Creating a Distribution Zip File

To create a zip file for distribution:

**On macOS/Linux**:
```bash
cd sample-rate-extension
zip -r ../sentry-span-optimizer.zip . -x "*.git*" -x "*.DS_Store" -x "*.zip" -x "node_modules/*"
```

**On Windows (PowerShell)**:
```powershell
cd sample-rate-extension
Compress-Archive -Path * -DestinationPath ..\sentry-span-optimizer.zip -Exclude @("*.git*", "*.DS_Store", "*.zip", "node_modules")
```

**Or manually**:
1. Select all files in the `sample-rate-extension` directory (except `.git` folder)
2. Create a zip file named `sentry-span-optimizer.zip`
3. Share the zip file for others to download and install

## Setup

1. **Log into Sentry**:
   - Make sure you're logged into Sentry in your browser
   - The extension uses your browser session cookies for authentication (no token needed!)

2. **Open the Extension**:
   - Click the extension icon in your browser toolbar
   - This opens the full-page app in a new tab

3. **Auto-detect Organization** (Optional):
   - Click the "Detect" button to automatically detect the organization from any open Sentry tab
   - Or manually enter your organization slug
   - The extension will automatically load available projects

## Usage

1. **Fetch Data**:
   - Select a date range (7, 30, or 90 days)
   - Click "Fetch Data"
   - Wait for the span data to load

2. **Configure Sampling Rules**:
   - Set a global default sampling rate (0-100%)
   - Add custom rules with flexible matching:
     - **Select an attribute**: Choose from span.op, span.description, span.status, span.domain, span.action, span.module, span.system, transaction, transaction.op, transaction.method, environment, or release
     - **Choose a match operator**: Contains, Equals, Starts With, Ends With, or Regex
     - **Enter a value**: Use autocomplete to see available values from your data
     - **Set a sampling rate**: 0-100% for matching spans
   - Set an expansion factor (e.g., 4x for projected traffic growth)

3. **Calculate Optimization**:
   - Click "Calculate Optimization"
   - View the results:
     - **Baseline Usage**: Current total span count
     - **Optimized Usage**: Projected usage after applying sampling rules
     - **Cost Reduction**: Percentage reduction in usage

4. **Review Breakdown**:
   - See how each span group is affected by your rules
   - Search through span groups using the search box
   - Navigate through paginated results (50 items per page)
   - View optimized count, baseline count, and applied sampling rate for each group

## How It Works

The extension uses the Sentry Discover API to fetch aggregate span data. It then applies your sampling rules in order:

1. **Rule matches** (most specific) - Rules are checked in order, first match wins
2. **Global default rate** - Applied if no specific rule matches

The formula used for calculation:
```
New Count = Σ (Raw Count × Sample Rate × Expansion Factor)
Monthly Projection = Period Count × (30 / Period Days)
```

Rules support multiple span attributes and operators for flexible matching. The extension shows both the period totals and projected monthly usage.

## File Structure

```
sample-rate-extension/
├── manifest.json          # Extension manifest (Manifest V3)
├── app.html              # Full-page UI interface (opens when clicking extension icon)
├── app.css               # Full-page styling
├── app.js                # Full-page UI logic and interactions
├── popup.html            # Popup UI interface (not currently used)
├── popup.css             # Popup styling
├── popup.js              # Popup UI logic
├── api.js                # Sentry API integration and organization detection
├── calculator.js         # Sampling rate calculation logic
├── background.js         # Background service worker (handles API calls)
├── ui-utils.js          # Shared UI utilities
├── rule-utils.js         # Rule management utilities
├── .gitignore            # Git ignore rules
└── README.md             # This file
```

## Permissions

- `storage`: Store extension settings locally
- `activeTab`: Access Sentry tabs to detect organization
- `cookies`: Access Sentry session cookies for authentication
- `*://*.sentry.io/*`: Make API calls to Sentry

## Security

- Uses your browser's existing Sentry session cookies (no token storage needed)
- No data is sent to third-party servers
- All API calls are made directly to Sentry's API
- Session cookies are accessed securely through Chrome's cookie API
- No credentials are stored in the extension

## Troubleshooting

**"Could not detect organization"**:
- Ensure you're on a Sentry page (sentry.io domain)
- Try navigating to an organization-specific page

**"Authentication failed"**:
- Ensure you're logged into Sentry in your browser
- Try refreshing your Sentry session by logging out and back in
- Make sure you have access to the organization you're trying to query

**"No span data found"**:
- Try selecting a longer date range
- Ensure your organization has span data for the selected period
- Check that you have access to the organization's data

**"Rate limit exceeded"**:
- Wait a few minutes before trying again
- Sentry API has rate limits to prevent abuse

## Development

To modify the extension:

1. Make changes to the source files
2. Reload the extension in your browser:
   - Chrome: Go to `chrome://extensions/` and click the reload icon
   - Firefox: The extension will auto-reload in debug mode
3. Test your changes

### Creating a Release

To create a distribution zip file:

**On macOS/Linux**:
```bash
./create-release.sh
```

**On Windows (PowerShell)**:
```powershell
.\create-release.ps1
```

This will create a zip file in the `releases/` directory that can be shared with others.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

