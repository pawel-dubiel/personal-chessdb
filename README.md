# Chess Database Application

A ChessBase-like application built with JavaScript for storing and searching chess games in PGN format.

## Features

- Import PGN files (single or multiple games)
- Store games in SQLite database
- Search games by:
  - Player names (White/Black)
  - Opening name
  - ECO code
  - Result
  - Date range
- Interactive game viewer with:
  - Move-by-move replay
  - Auto-play functionality
  - Visual chess board
- Database statistics
- Delete individual games

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

## Usage

### Importing Games

1. Copy your PGN text (can contain multiple games)
2. Paste it into the "Import PGN" textarea
3. Click "Import Games"

A sample PGN file (`sample.pgn`) is included with famous games you can use for testing.

### Searching Games

Use the search form to filter games by:
- White player name
- Black player name
- Opening name
- ECO code
- Result (White wins/Black wins/Draw)
- Date range

### Viewing Games

Click the "View" button on any game to open the interactive viewer where you can:
- Step through moves one by one
- Jump to any position
- Auto-play through the game
- See game details and move list

## Technologies Used

- **Backend**: Node.js, Express.js
- **Database**: SQLite3
- **Frontend**: HTML, CSS, JavaScript
- **Chess Logic**: chess.js
- **Chess Board UI**: chessboard.js

## Database Schema

Games are stored with the following fields:
- White player
- Black player
- Result
- Date
- Event
- Site
- Round
- ECO code
- Opening name
- Moves
- Full PGN text

## API Endpoints

- `POST /api/games/import` - Import PGN games
- `GET /api/games/search` - Search games with filters
- `GET /api/games/:id` - Get specific game
- `DELETE /api/games/:id` - Delete a game
- `GET /api/stats` - Get database statistics