#!/usr/bin/env bash
set -e

echo "=== Installing backend dependencies ==="
cd backend
pip install -r requirements.txt

echo "=== Installing frontend dependencies ==="
cd ../frontend
npm ci

echo "=== Building frontend ==="
npm run build

echo "=== Copying frontend build to backend/static ==="
rm -rf ../backend/static
cp -r dist ../backend/static

echo "=== Build complete ==="
