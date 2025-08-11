# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a ChessBase-like chess database application built with Node.js/Express backend and vanilla JavaScript frontend. It stores chess games in PGN format in an SQLite database and provides search, import, and interactive game viewing capabilities.

## Common Development Commands

```bash
npm install      # Install dependencies
npm start        # Start server on port 3000
npm run dev      # Start with nodemon for auto-reload
```

The application runs at `http://localhost:3000`

## Architecture

### Backend Structure

- **server.js**: Express server with API endpoints
  - `/api/games/import` - Import PGN text (JSON body)
  - `/api/games/upload` - Upload PGN/ZIP files (multipart form)
  - `/api/games/search` - Search with query parameters
  - `/api/games/:id` - Get/delete specific game
  - `/api/stats` - Database statistics

- **src/pgnUtils.js**: PGN parsing logic
  - `parsePGN()` - Splits multi-game PGN files by detecting `[Event` boundaries
  - `extractGameInfo()` - Extracts headers and moves from individual games
  - Games must have `[White`, `[Black`, and `[Result` headers to be valid

### Frontend Structure

- **public/index.html**: Single-page application with tabbed import interface
- **public/app.js**: Main application logic
  - File upload handling with drag-and-drop support
  - Game viewer with chess.js for move validation
  - Chessboard.js for visual board representation
- **public/styles.css**: All styling including responsive design

### Database

SQLite database (`chess_database.db`) with indexed fields:
- Games table stores both parsed data (white, black, eco, etc.) and full PGN text
- Indexes on white, black, date, eco, result for fast searching

### File Upload Handling

- Supports `.pgn` and `.zip` files up to 100MB
- ZIP files are extracted server-side to find all PGN files within
- Temporary uploads stored in `uploads/` directory (auto-cleaned after processing)
- Uses multer middleware for multipart form handling

## Key Implementation Details

### PGN Parser
The parser handles multiple games by:
1. Splitting on `[Event ` boundaries using lookahead regex
2. Validating required headers presence
3. Extracting moves after header section ends
4. Cleaning moves of comments, variations, and formatting

### Game Viewer
Interactive replay uses:
- chess.js for move validation and game state
- chessboard.js for board visualization
- Move-by-move navigation with keyboard support
- Auto-play functionality with configurable speed

### Import Methods
Two import paths:
1. Text paste → `/api/games/import` with JSON body
2. File upload → `/api/games/upload` with multipart form

Both converge to same PGN parsing and database insertion logic.