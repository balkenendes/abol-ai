#!/bin/bash
# Deploy abol.ai to Vercel production
# Usage: bash deploy.sh

set -e

echo "=== Deploying abol.ai ==="

# Ensure index.html is up to date with app.html (React SPA)
cp app.html index.html

# thanks.html is a static page served at abol.ai/thanks (Stripe success_url target).
# It lives at the repo root and Vercel serves it as-is at /thanks — no copy needed
# as long as the file is in the deploy directory.

# Deploy to production (Vercel picks up all .html files at the repo root)
npx vercel deploy --prod

echo ""
echo "=== Done. Site live at https://abol.ai ==="
echo "  Landing:   https://abol.ai"
echo "  Thanks:    https://abol.ai/thanks"
