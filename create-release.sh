#!/bin/bash

# Script to create a distribution zip file for the Sentry Span Optimizer extension

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_NAME="sentry-span-optimizer"
VERSION=$(date +"%Y%m%d")

echo "Creating distribution zip for $EXTENSION_NAME..."

# Create releases directory if it doesn't exist
mkdir -p "$SCRIPT_DIR/releases"

# Change to script directory
cd "$SCRIPT_DIR"

# Create zip file excluding git files and other unnecessary files
zip -r "releases/${EXTENSION_NAME}-${VERSION}.zip" . \
  -x "*.git*" \
  -x "*.DS_Store" \
  -x "*.zip" \
  -x "node_modules/*" \
  -x ".vscode/*" \
  -x ".idea/*" \
  -x "*.log" \
  -x "create-release.sh" \
  -x "releases/*"

echo ""
echo "✓ Created: releases/${EXTENSION_NAME}-${VERSION}.zip"
echo ""
echo "To install:"
echo "1. Extract the zip file"
echo "2. Open Chrome: chrome://extensions/ → Enable Developer mode → Load unpacked"
echo "3. Select the extracted folder"
echo ""


