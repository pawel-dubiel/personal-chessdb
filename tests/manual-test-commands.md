# Manual Test Commands for Chess Database API

This file contains curl commands you can copy and paste to test the chess database API manually.

## Prerequisites
Make sure the server is running: `npm start`

## Basic API Tests

### 1. Database Statistics
```bash
# Get basic stats
curl -s http://localhost:3000/api/stats | python3 -m json.tool

# Get detailed stats  
curl -s http://localhost:3000/api/stats/detailed | python3 -m json.tool
```

## Position Search Tests

### 2. Exact Position Search
```bash
# Search for starting position
curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","searchType":"exact","page":1,"pageSize":3}' \
  | python3 -m json.tool

# Search for position after 1.e4 c5 (Sicilian Defense)
curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"fen":"rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2","searchType":"exact","page":1,"pageSize":3}' \
  | python3 -m json.tool
```

### 3. Pattern Search - Single Pieces
```bash
# Find all positions with a pawn on d4
curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"fen":"8/8/8/8/3P4/8/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":3}' \
  | python3 -m json.tool

# Find all positions with a knight on f3
curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"fen":"8/8/8/8/8/5N2/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":3}' \
  | python3 -m json.tool
```

### 4. Material Signature Search
```bash
# Find positions with same material as starting position
curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","searchType":"material","page":1,"pageSize":3}' \
  | python3 -m json.tool
```

## Multi-Piece Pattern Tests (OR Logic)

### 5. Simple OR Patterns
```bash
# Find positions where d4 has either a white pawn OR white knight
curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"fen":"8/8/8/8/3[P|N]4/8/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":3}' \
  | python3 -m json.tool

# Find positions where d4 has either white OR black pawn
curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"fen":"8/8/8/8/3[P|p]4/8/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":3}' \
  | python3 -m json.tool

# Find positions where e4 has bishop OR queen OR rook
curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"fen":"8/8/8/8/4[B|Q|R]3/8/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":3}' \
  | python3 -m json.tool
```

### 6. Complex Multi-Square Patterns
```bash
# d4 can be [P|N] AND e4 can be [B|R]
curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"fen":"8/8/8/8/3[P|N][B|R]3/8/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":3}' \
  | python3 -m json.tool

# Central squares occupied by pawns or knights
curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"fen":"8/8/8/8/3[P|N][P|N]3/8/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":3}' \
  | python3 -m json.tool
```

## Streaming Search Tests

### 7. Streaming Search with Progress
```bash
# Stream a pattern search and see progress updates
curl -N -X POST http://localhost:3000/api/positions/search/stream \
  -H "Content-Type: application/json" \
  -d '{"fen":"8/8/8/8/3[P|N]4/8/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":3}' \
  | head -10

# Stream a more complex search
curl -N -X POST http://localhost:3000/api/positions/search/stream \
  -H "Content-Type: application/json" \
  -d '{"fen":"8/8/8/8/[P|p][N|n][B|b][R|r]4/8/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":2}' \
  | head -15
```

## Index Management Tests

### 8. Database Management
```bash
# Check for missing indexes
curl -s -X POST http://localhost:3000/api/index/fix \
  | python3 -m json.tool

# Optimize database
curl -s -X POST http://localhost:3000/api/index/optimize \
  | python3 -m json.tool

# Clear index (WARNING: Will remove all position indexes!)
# curl -s -X POST http://localhost:3000/api/index/clear | python3 -m json.tool

# Rebuild index (WARNING: Will take several minutes!)
# curl -s -X POST http://localhost:3000/api/index/rebuild | python3 -m json.tool
```

## Game Search Tests

### 9. Standard Game Search
```bash
# Search by player
curl -s "http://localhost:3000/api/games/search?white=Adams&pageSize=3" \
  | python3 -m json.tool

# Search by result
curl -s "http://localhost:3000/api/games/search?result=1-0&pageSize=3" \
  | python3 -m json.tool

# Search by opening (if ECO codes are available)
curl -s "http://localhost:3000/api/games/search?eco=B01&pageSize=3" \
  | python3 -m json.tool
```

## Validation Tests

### 10. Error Handling
```bash
# Invalid search type
curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"fen":"8/8/8/8/3P4/8/8/8 w - - 0 1","searchType":"invalid","page":1,"pageSize":3}' \
  | python3 -m json.tool

# Missing FEN
curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"searchType":"pattern","page":1,"pageSize":3}' \
  | python3 -m json.tool

# Invalid FEN format
curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"fen":"invalid-fen","searchType":"pattern","page":1,"pageSize":3}' \
  | python3 -m json.tool
```

## Performance Comparison Tests

### 11. Timing Different Search Types
```bash
# Time exact search
echo "Testing exact search speed..."
time curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"fen":"rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 1","searchType":"exact","page":1,"pageSize":1}' \
  > /dev/null

# Time pattern search
echo "Testing pattern search speed..."
time curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"fen":"8/8/8/8/3P4/8/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":1}' \
  > /dev/null

# Time multi-piece pattern search
echo "Testing multi-piece pattern search speed..."
time curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"fen":"8/8/8/8/3[P|N]4/8/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":1}' \
  > /dev/null
```

## Verification Tests

### 12. Verify OR Logic Manually
```bash
# Count white pawns on d4
WHITE_PAWNS=$(curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"fen":"8/8/8/8/3P4/8/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":1}' \
  | python3 -c "import json,sys; data=json.load(sys.stdin); print(data['pagination']['totalGames'])")

# Count black pawns on d4
BLACK_PAWNS=$(curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"fen":"8/8/8/8/3p4/8/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":1}' \
  | python3 -c "import json,sys; data=json.load(sys.stdin); print(data['pagination']['totalGames'])")

# Count OR condition (should be approximately WHITE_PAWNS + BLACK_PAWNS)
OR_PAWNS=$(curl -s -X POST http://localhost:3000/api/positions/search \
  -H "Content-Type: application/json" \
  -d '{"fen":"8/8/8/8/3[P|p]4/8/8/8 w - - 0 1","searchType":"pattern","page":1,"pageSize":1}' \
  | python3 -c "import json,sys; data=json.load(sys.stdin); print(data['pagination']['totalGames'])")

echo "White pawns on d4: $WHITE_PAWNS"
echo "Black pawns on d4: $BLACK_PAWNS"  
echo "OR condition [P|p]: $OR_PAWNS"
echo "Sum check: $((WHITE_PAWNS + BLACK_PAWNS)) ≈ $OR_PAWNS"
```

## Notes

- All commands use `python3 -m json.tool` for pretty-printing JSON responses
- Streaming commands use `curl -N` and `head -X` to show progress updates
- Use `time` command to measure performance
- The OR logic verification at the end proves that multi-piece patterns work correctly
- Database modification commands (clear, rebuild) are commented out for safety