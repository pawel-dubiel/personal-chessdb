# ChessDB - High-Performance Chess Database

A Go-based chess database optimized for storing and searching millions of chess games with advanced pattern matching capabilities.

## Features

- **High Performance**: SQLite with optimized indexes for fast queries
- **Position Search**: Search games by exact FEN positions
- **Pattern Matching**: Advanced pattern search with OR conditions for pieces
- **Full-Text Search**: Search by player names, events, openings
- **REST API**: Complete HTTP API for all operations
- **Batch Import**: Import multiple games efficiently
- **Index Optimization**: Multiple specialized indexes for different query types

## Installation

```bash
cd chdb
go mod download
go build -o chessdb cmd/chessdb/main.go
```

## Usage

Start the server:
```bash
./chessdb -port 8080 -db chess.db
```

## API Endpoints

### Import Games

```bash
# Import PGN text
curl -X POST http://localhost:8080/api/v1/games/import \
  -H "Content-Type: application/json" \
  -d '{"pgn": "[Event \"Test\"]\n[White \"Carlsen\"]\n[Black \"Nakamura\"]\n[Result \"1-0\"]\n\n1.e4 e5 2.Nf3 1-0"}'

# Import PGN file
curl -X POST http://localhost:8080/api/v1/games/import/file \
  -F "file=@games.pgn"
```

### Search Games

```bash
# Search by player
curl "http://localhost:8080/api/v1/games/search?white=Carlsen&limit=10"

# Search by either player
curl "http://localhost:8080/api/v1/games/search?either=Kasparov&limit=10"

# Search by opening
curl "http://localhost:8080/api/v1/games/search?eco=B90&limit=10"

# Search by position (FEN)
curl "http://localhost:8080/api/v1/games/search?position=rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR%20b%20KQkq%20e3%200%201"

# Search with multiple criteria
curl "http://localhost:8080/api/v1/games/search?white=Fischer&black=Spassky&result=1-0"
```

### Pattern Search

Search for games with specific piece patterns with OR conditions:

```bash
curl -X POST http://localhost:8080/api/v1/games/search/pattern \
  -H "Content-Type: application/json" \
  -d '{
    "board": [
      [{"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}],
      [{"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}],
      [{"any": true}, {"any": true}, {"pieces": ["N", "B"]}, {"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}],
      [{"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}],
      [{"any": true}, {"any": true}, {"any": true}, {"pieces": ["P"]}, {"any": true}, {"any": true}, {"any": true}, {"any": true}],
      [{"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}],
      [{"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}, {"any": true}],
      [{"any": true}, {"any": true}, {"any": true}, {"any": true}, {"pieces": ["K"]}, {"any": true}, {"any": true}, {"any": true}]
    ],
    "side_to_move": "white"
  }'
```

### Get Game

```bash
curl http://localhost:8080/api/v1/games/1
```

### Delete Game

```bash
curl -X DELETE http://localhost:8080/api/v1/games/1
```

### Statistics

```bash
curl http://localhost:8080/api/v1/stats
```

## Pattern Matching

The pattern matching system allows complex queries where you can specify:
- **Exact pieces**: Specific piece on a square
- **OR conditions**: Multiple possible pieces on a square (e.g., "N" or "B")
- **Empty squares**: Squares that must be empty
- **Any squares**: Squares that can contain anything

Example pattern structure:
```json
{
  "board": [
    [...8 squares for rank 8...],
    [...8 squares for rank 7...],
    ...
  ],
  "side_to_move": "white" | "black" | null
}
```

Each square can be:
- `{"any": true}` - Any piece or empty
- `{"empty": true}` - Must be empty
- `{"pieces": ["K", "Q"]}` - King OR Queen (OR condition)

## Database Schema

The database uses multiple tables with optimized indexes:
- `games` - Main game storage with player, date, and result indexes
- `position_index` - FEN position indexing for fast position searches
- `piece_patterns` - Pattern hashing for complex pattern matching
- `games_fts` - Full-text search virtual table

## Performance

- Handles millions of games efficiently
- Sub-second searches on indexed fields
- Batch import with transaction optimization
- WAL mode for concurrent reads
- Position hashing for fast lookups

## Query Examples

```sql
-- Games by player
SELECT * FROM games WHERE white LIKE '%Carlsen%' OR black LIKE '%Carlsen%';

-- Games by opening
SELECT * FROM games WHERE eco = 'B90';

-- High-rated games
SELECT * FROM games WHERE white_elo > 2700 AND black_elo > 2700;

-- Recent games
SELECT * FROM games WHERE date >= '2023-01-01' ORDER BY date DESC;
```