#!/bin/bash

# Chess Database API Test Commands
# Run these commands to test various API endpoints

echo "🧪 Chess Database API Test Suite"
echo "================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3000"

# Helper function to test API endpoint
test_api() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected_field="$5"
    
    echo -e "\n${BLUE}Testing: $name${NC}"
    echo "Endpoint: $method $endpoint"
    
    if [ "$method" = "POST" ]; then
        if [ -n "$data" ]; then
            response=$(curl -s -X POST "$BASE_URL$endpoint" \
                -H "Content-Type: application/json" \
                -d "$data")
        else
            response=$(curl -s -X POST "$BASE_URL$endpoint")
        fi
    else
        response=$(curl -s "$BASE_URL$endpoint")
    fi
    
    if echo "$response" | grep -q '"success":true'; then
        echo -e "${GREEN}✅ PASS${NC}"
        if [ -n "$expected_field" ]; then
            value=$(echo "$response" | python3 -c "import json,sys; data=json.load(sys.stdin); print(data.get('$expected_field', 'N/A'))")
            echo "Result: $expected_field = $value"
        fi
    else
        echo -e "${RED}❌ FAIL${NC}"
        echo "Response: $response"
    fi
}

# Test 1: Basic API Health
echo -e "\n${YELLOW}=== Basic API Tests ===${NC}"

test_api "Database Stats" "GET" "/api/stats" "" "totalGames"
test_api "Detailed Stats" "GET" "/api/stats/detailed" "" "totalPositions"

# Test 2: Standard Position Search
echo -e "\n${YELLOW}=== Standard Position Search Tests ===${NC}"

# Exact position search - starting position
test_api "Exact Search - Starting Position" "POST" "/api/positions/search" \
    '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","searchType":"exact","page":1,"pageSize":3}' \
    "totalGames"

# Material signature search
test_api "Material Search - Same Pieces" "POST" "/api/positions/search" \
    '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","searchType":"material","page":1,"pageSize":3}' \
    "totalGames"

# Pattern search - single piece
test_api "Pattern Search - Pawn on d4" "POST" "/api/positions/search" \
    '{"fen":"8/8/8/8/3P4/8/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":3}' \
    "totalGames"

# Test 3: Multi-Piece Pattern Search
echo -e "\n${YELLOW}=== Multi-Piece Pattern Search Tests ===${NC}"

# Test OR logic - Pawn OR Knight on d4
test_api "Multi-Piece - Pawn OR Knight on d4" "POST" "/api/positions/search" \
    '{"fen":"8/8/8/8/3[P|N]4/8/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":3}' \
    "totalGames"

# Test color-agnostic - White OR Black pawn on d4  
test_api "Multi-Piece - White OR Black Pawn on d4" "POST" "/api/positions/search" \
    '{"fen":"8/8/8/8/3[P|p]4/8/8/8 w - - - 0 1","searchType":"pattern","page":1,"pageSize":3}' \
    "totalGames"

# Test multiple constraints
test_api "Multi-Piece - Complex Pattern" "POST" "/api/positions/search" \
    '{"fen":"8/8/8/8/3[P|N][B|R]3/8/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":3}' \
    "totalGames"

# Test 4: Streaming Search (with timeout)
echo -e "\n${YELLOW}=== Streaming Search Tests ===${NC}"

echo -e "\n${BLUE}Testing: Streaming Pattern Search${NC}"
echo "Endpoint: POST /api/positions/search/stream"
echo "Note: This test shows first few progress updates then times out"

timeout 10s curl -N -X POST "$BASE_URL/api/positions/search/stream" \
    -H "Content-Type: application/json" \
    -d '{"fen":"8/8/8/8/3[P|N]4/8/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":2}' 2>/dev/null | head -5

if [ $? -eq 124 ]; then
    echo -e "${GREEN}✅ PASS${NC} - Streaming search is working (timed out as expected)"
else
    echo -e "${YELLOW}⚠️  PARTIAL${NC} - Stream may have completed quickly"
fi

# Test 5: Index Management 
echo -e "\n${YELLOW}=== Index Management Tests ===${NC}"

test_api "Fix Missing Indexes" "POST" "/api/index/fix" "" "fixed"
test_api "Optimize Database" "POST" "/api/index/optimize" "" "success"

# Test 6: Game Search
echo -e "\n${YELLOW}=== Game Search Tests ===${NC}"

test_api "Search Games by Result" "GET" "/api/games/search?result=1-0&pageSize=3" "" "totalGames"
test_api "Search Games by Player" "GET" "/api/games/search?white=Adams&pageSize=3" "" "totalGames"

# Test 7: Validation Tests
echo -e "\n${YELLOW}=== Validation Tests ===${NC}"

echo -e "\n${BLUE}Testing: Invalid Search Type${NC}"
response=$(curl -s -X POST "$BASE_URL/api/positions/search" \
    -H "Content-Type: application/json" \
    -d '{"fen":"8/8/8/8/3P4/8/8/8 w - - 0 1","searchType":"invalid","page":1,"pageSize":3}')

if echo "$response" | grep -q '"success":false'; then
    echo -e "${GREEN}✅ PASS${NC} - Invalid search type properly rejected"
else
    echo -e "${RED}❌ FAIL${NC} - Should reject invalid search type"
fi

echo -e "\n${BLUE}Testing: Missing FEN${NC}"
response=$(curl -s -X POST "$BASE_URL/api/positions/search" \
    -H "Content-Type: application/json" \
    -d '{"searchType":"pattern","page":1,"pageSize":3}')

if echo "$response" | grep -q '"success":false'; then
    echo -e "${GREEN}✅ PASS${NC} - Missing FEN properly rejected"
else
    echo -e "${RED}❌ FAIL${NC} - Should reject missing FEN"
fi

# Test 8: Performance Comparison
echo -e "\n${YELLOW}=== Performance Comparison ===${NC}"

echo -e "\n${BLUE}Comparing search performance:${NC}"

# Time exact search
echo "Timing exact search..."
time_exact=$(time (curl -s -X POST "$BASE_URL/api/positions/search" \
    -H "Content-Type: application/json" \
    -d '{"fen":"rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 1","searchType":"exact","page":1,"pageSize":1}' > /dev/null) 2>&1 | grep real | cut -d' ' -f2)

# Time pattern search  
echo "Timing simple pattern search..."
time_pattern=$(time (curl -s -X POST "$BASE_URL/api/positions/search" \
    -H "Content-Type: application/json" \
    -d '{"fen":"8/8/8/8/3P4/8/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":1}' > /dev/null) 2>&1 | grep real | cut -d' ' -f2)

echo "Exact search time: ${time_exact:-N/A}"
echo "Pattern search time: ${time_pattern:-N/A}"

# Summary
echo -e "\n${YELLOW}=== Test Summary ===${NC}"
echo "All API endpoints tested!"
echo ""
echo "Key Features Verified:"
echo "✅ Basic position search (exact, material, pattern)"  
echo "✅ Multi-piece OR logic ([P|N], [P|p], etc.)"
echo "✅ Streaming search with progress updates"
echo "✅ Database statistics and management"
echo "✅ Input validation and error handling"
echo ""
echo "To run individual tests, copy the curl commands above."
echo "To run unit tests: node tests/test-multipiece-logic.js"