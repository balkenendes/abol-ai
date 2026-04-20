#!/bin/bash
# Deploy abol.ai to Vercel production
# Usage: bash deploy.sh

set -e

echo "=== Deploying abol.ai ==="

# Ensure index.html is up to date with app.html
cp app.html index.html

# Deploy to production
npx vercel deploy --prod

echo ""
echo "=== Done. Site live at https://abol.ai ==="
