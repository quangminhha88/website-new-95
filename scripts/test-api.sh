#!/bin/bash

# Configuration
API_URL="http://localhost:3000/api"
QUERY=${1:-"I need a social media scheduler for a solo creator"}

echo "🚀 Testing Recommendation API..."
echo "🔍 Query: $QUERY"
echo "-----------------------------------"

echo "📍 Testing Standard Engine (Gemini)..."
curl -s -X POST "$API_URL/recommend" \
     -H "Content-Type: application/json" \
     -d "{\"user_query\": \"$QUERY\"}" | jq .

echo -e "\n-----------------------------------"
echo "📍 Testing Advanced Engine (OpenAI)..."
curl -s -X POST "$API_URL/recommend-advanced" \
     -H "Content-Type: application/json" \
     -d "{\"user_query\": \"$QUERY\"}" | jq .
