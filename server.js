const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const { parsePGN, searchGames, extractGameInfo } = require('./src/pgnUtils');
const { extractAllPositions, computeZobristHash, getMaterialSignature, normalizeFEN, searchPositionPattern } = require('./src/positionIndex');

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const HOST = process.env.HOST || '127.0.0.1';

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Enable SharedArrayBuffer for Stockfish WASM (required for all static files)
app.use(express.static('public', {
    setHeaders: (res, path, stat) => {
        // Set COEP and COOP headers for all static files to enable SharedArrayBuffer
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        
        // Set CORS headers for worker files to be embeddable
        if (path.endsWith('.js') || path.endsWith('.wasm')) {
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        }
        
        // Set correct MIME type for WASM files
        if (path.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
        }
    }
}));

const db = new sqlite3.Database('./chess_database.db');
// Improve concurrency characteristics
try {
  db.configure && db.configure('busyTimeout', 10000);
} catch (_) {}
db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      white TEXT,
      black TEXT,
      result TEXT,
      date TEXT,
      event TEXT,
      site TEXT,
      round TEXT,
      eco TEXT,
      opening TEXT,
      moves TEXT,
      pgn TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER,
      move_number INTEGER,
      fen TEXT,
      fen_position TEXT,
      zobrist_hash TEXT,
      material_signature TEXT,
      move TEXT,
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_white ON games(white);
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_black ON games(black);
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_date ON games(date);
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_eco ON games(eco);
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_result ON games(result);
  `);
  
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_zobrist ON positions(zobrist_hash);
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_material ON positions(material_signature);
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_fen_position ON positions(fen_position);
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_game_move ON positions(game_id, move_number);
  `);

  // Piece locations table for optimized pattern search
  db.run(`
    CREATE TABLE IF NOT EXISTS piece_locations (
      position_id INTEGER,
      square INTEGER,      -- 0-63 (a1=0, h8=63)
      piece CHAR(1),       -- P,N,B,R,Q,K,p,n,b,r,q,k
      FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE
    )
  `);

  // Critical indexes for fast pattern searches
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_square_piece ON piece_locations(square, piece);
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_piece_square ON piece_locations(piece, square);
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_piece_position ON piece_locations(position_id);
  `);
});

function indexGamePositions(gameId, moves) {
  const { extractPieceLocations } = require('./src/positionIndex');
  const positions = extractAllPositions(moves);
  
  const posStmt = db.prepare(`
    INSERT INTO positions (game_id, move_number, fen, fen_position, zobrist_hash, material_signature, move)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  const pieceStmt = db.prepare(`
    INSERT INTO piece_locations (position_id, square, piece)
    VALUES (?, ?, ?)
  `);
  
  positions.forEach(pos => {
    const fenPosition = pos.fen.split(' ')[0];
    const zobristHash = computeZobristHash(pos.fen);
    const materialSig = getMaterialSignature(pos.fen);
    
    // Insert position record
    const result = posStmt.run(
      gameId,
      pos.moveNumber,
      pos.fen,
      fenPosition,
      zobristHash,
      materialSig,
      pos.move
    );
    
    const positionId = result.lastID;
    
    // Extract and index piece locations for pattern search
    const pieces = extractPieceLocations(fenPosition);
    pieces.forEach(({square, piece}) => {
      pieceStmt.run(positionId, square, piece);
    });
  });
  
  posStmt.finalize();
  pieceStmt.finalize();
}

app.post('/api/games/import', (req, res) => {
  const { pgn } = req.body;
  
  try {
    const games = parsePGN(pgn);
    console.log(`Parsed ${games.length} games from PGN text`);
    
    let imported = 0;
    let errors = [];

    const stmt = db.prepare(`
      INSERT INTO games (white, black, result, date, event, site, round, eco, opening, moves, pgn)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    games.forEach((game, index) => {
      try {
        const gameInfo = extractGameInfo(game);
        stmt.run(
          gameInfo.white,
          gameInfo.black,
          gameInfo.result,
          gameInfo.date,
          gameInfo.event,
          gameInfo.site,
          gameInfo.round,
          gameInfo.eco,
          gameInfo.opening,
          gameInfo.moves,
          game,
          function(err) {
            if (!err && this.lastID) {
              indexGamePositions(this.lastID, gameInfo.moves);
            }
          }
        );
        imported++;
      } catch (err) {
        errors.push({ game: index + 1, error: err.message });
      }
    });

    stmt.finalize();

    res.json({
      success: true,
      imported,
      total: games.length,
      errors
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/games/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded'
    });
  }

  const filePath = req.file.path;
  const fileName = req.file.originalname.toLowerCase();
  
  try {
    let pgnContent = '';
    
    if (fileName.endsWith('.zip')) {
      // Handle ZIP file
      const zip = new AdmZip(filePath);
      const zipEntries = zip.getEntries();
      
      for (const entry of zipEntries) {
        if (entry.entryName.toLowerCase().endsWith('.pgn')) {
          const content = zip.readAsText(entry);
          pgnContent += content + '\n\n';
        }
      }
      
      if (!pgnContent) {
        throw new Error('No PGN files found in ZIP archive');
      }
    } else if (fileName.endsWith('.pgn')) {
      // Handle PGN file
      pgnContent = fs.readFileSync(filePath, 'utf8');
    } else {
      throw new Error('Unsupported file type. Please upload a PGN or ZIP file');
    }
    
    // Parse and import games
    const games = parsePGN(pgnContent);
    console.log(`Parsed ${games.length} games from uploaded file: ${fileName}`);
    
    let imported = 0;
    let errors = [];

    const stmt = db.prepare(`
      INSERT INTO games (white, black, result, date, event, site, round, eco, opening, moves, pgn)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    games.forEach((game, index) => {
      try {
        const gameInfo = extractGameInfo(game);
        stmt.run(
          gameInfo.white,
          gameInfo.black,
          gameInfo.result,
          gameInfo.date,
          gameInfo.event,
          gameInfo.site,
          gameInfo.round,
          gameInfo.eco,
          gameInfo.opening,
          gameInfo.moves,
          game,
          function(err) {
            if (!err && this.lastID) {
              indexGamePositions(this.lastID, gameInfo.moves);
            }
          }
        );
        imported++;
      } catch (err) {
        errors.push({ game: index + 1, error: err.message });
      }
    });

    stmt.finalize();
    
    // Clean up uploaded file
    fs.unlinkSync(filePath);
    
    res.json({
      success: true,
      imported,
      total: games.length,
      fileName: req.file.originalname,
      errors
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/games/search', (req, res) => {
  const { 
    white, 
    black, 
    opening, 
    eco, 
    result, 
    dateFrom, 
    dateTo, 
    page = 1, 
    pageSize = 50 
  } = req.query;
  
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const limit = parseInt(pageSize);
  
  // Build WHERE clause
  let whereClause = 'WHERE 1=1';
  const params = [];

  if (white) {
    whereClause += ' AND white LIKE ?';
    params.push(`%${white}%`);
  }
  if (black) {
    whereClause += ' AND black LIKE ?';
    params.push(`%${black}%`);
  }
  if (opening) {
    whereClause += ' AND opening LIKE ?';
    params.push(`%${opening}%`);
  }
  if (eco) {
    whereClause += ' AND eco LIKE ?';
    params.push(`%${eco}%`);
  }
  if (result) {
    whereClause += ' AND result = ?';
    params.push(result);
  }
  if (dateFrom) {
    whereClause += ' AND date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += ' AND date <= ?';
    params.push(dateTo);
  }

  // First get total count for pagination
  const countQuery = `SELECT COUNT(*) as total FROM games ${whereClause}`;
  
  db.get(countQuery, params, (err, countResult) => {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
      return;
    }
    
    const totalGames = countResult.total;
    const totalPages = Math.ceil(totalGames / limit);
    
    // Then get paginated results
    const dataQuery = `SELECT * FROM games ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`;
    const dataParams = [...params, limit, offset];
    
    db.all(dataQuery, dataParams, (err, rows) => {
      if (err) {
        res.status(500).json({ success: false, error: err.message });
      } else {
        res.json({ 
          success: true, 
          games: rows, 
          pagination: {
            page: parseInt(page),
            pageSize: limit,
            totalGames,
            totalPages,
            hasNext: parseInt(page) < totalPages,
            hasPrev: parseInt(page) > 1
          }
        });
      }
    });
  });
});

app.post('/api/positions/search/stream', (req, res) => {
  const { fen, searchType = 'exact', page = 1, pageSize = 50 } = req.body;
  
  if (!fen) {
    return res.status(400).json({ 
      success: false, 
      error: 'FEN position is required' 
    });
  }
  
  // Set up Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
  
  const sendProgress = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  const sendError = (error) => {
    sendProgress({ type: 'error', error });
    res.end();
  };
  
  const sendComplete = (results) => {
    sendProgress({ type: 'complete', ...results });
    res.end();
  };
  
  try {
    if (searchType === 'pattern') {
      // Use optimized pattern search with streaming progress
      const { buildOptimizedPatternQuery } = require('./src/positionIndex');
      const queryResult = buildOptimizedPatternQuery(fen, pageSize, (page - 1) * pageSize);
      
      sendProgress({ 
        type: 'progress', 
        message: 'Executing optimized pattern search...',
        progress: 25 
      });
      
      // Get count first
      db.get(queryResult.countQuery, queryResult.countParams, (err, countResult) => {
        if (err) {
          return sendError(err.message);
        }
        
        const totalGames = countResult.total;
        
        sendProgress({ 
          type: 'progress', 
          message: `Found ${totalGames} matching games, retrieving results...`,
          progress: 50 
        });
        
        // Get results
        db.all(queryResult.query, queryResult.params, (err, rows) => {
          if (err) {
            return sendError(err.message);
          }
          
          sendProgress({ 
            type: 'progress', 
            message: `Processing ${rows.length} game records...`,
            progress: 75 
          });
          
          const gamesWithPositions = {};
          rows.forEach(row => {
            if (!gamesWithPositions[row.id]) {
              gamesWithPositions[row.id] = {
                ...row,
                positions: []
              };
              // Clean up extra fields
              delete gamesWithPositions[row.id].move_number;
              delete gamesWithPositions[row.id].move;
              delete gamesWithPositions[row.id].position_id;
            }
            
            gamesWithPositions[row.id].positions.push({
              moveNumber: row.move_number,
              move: row.move
            });
          });
          
          sendComplete({
            success: true,
            games: Object.values(gamesWithPositions),
            searchType,
            pagination: {
              page: parseInt(page),
              pageSize: parseInt(pageSize),
              totalGames: totalGames,
              totalPages: Math.ceil(totalGames / pageSize),
              hasNext: page * pageSize < totalGames,
              hasPrev: page > 1
            }
          });
        });
      });
    } else {
      // For other search types, use the regular search logic but still send progress
      sendProgress({ 
        type: 'progress', 
        message: 'Searching database...',
        progress: 50 
      });
      
      // Call the regular search logic here and send results
      // (I'll implement this part if needed)
      sendComplete({
        success: true,
        message: 'Use /api/positions/search for non-pattern searches',
        games: []
      });
    }
  } catch (error) {
    sendError(error.message);
  }
});

app.post('/api/positions/search', (req, res) => {
  const { fen, searchType = 'exact', page = 1, pageSize = 50 } = req.body;
  
  if (!fen) {
    return res.status(400).json({ 
      success: false, 
      error: 'FEN position is required' 
    });
  }
  
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  const limit = parseInt(pageSize);
  
  try {
    const fenPosition = fen.split(' ')[0];
    let query, params;
    
    if (searchType === 'exact') {
      query = `
        SELECT g.*, p.move_number, p.move
        FROM positions p
        JOIN games g ON p.game_id = g.id
        WHERE p.fen_position = ?
          AND g.id IN (
            SELECT DISTINCT g2.id
            FROM positions p2
            JOIN games g2 ON p2.game_id = g2.id
            WHERE p2.fen_position = ?
            ORDER BY g2.id DESC
            LIMIT ${limit} OFFSET ${offset}
          )
        ORDER BY g.id DESC, p.move_number
      `;
      params = [fenPosition, fenPosition];
    } else if (searchType === 'material') {
      const materialSig = getMaterialSignature(fen);
      query = `
        SELECT g.*, p.move_number, p.move
        FROM positions p
        JOIN games g ON p.game_id = g.id
        WHERE p.material_signature = ?
          AND g.id IN (
            SELECT DISTINCT g2.id
            FROM positions p2
            JOIN games g2 ON p2.game_id = g2.id
            WHERE p2.material_signature = ?
            ORDER BY g2.id DESC
            LIMIT ${limit} OFFSET ${offset}
          )
        ORDER BY g.id DESC, p.move_number
      `;
      params = [materialSig, materialSig];
    } else if (searchType === 'zobrist') {
      const zobristHash = computeZobristHash(fen);
      query = `
        SELECT g.*, p.move_number, p.move
        FROM positions p
        JOIN games g ON p.game_id = g.id
        WHERE p.zobrist_hash = ?
          AND g.id IN (
            SELECT DISTINCT g2.id
            FROM positions p2
            JOIN games g2 ON p2.game_id = g2.id
            WHERE p2.zobrist_hash = ?
            ORDER BY g2.id DESC
            LIMIT ${limit} OFFSET ${offset}
          )
        ORDER BY g.id DESC, p.move_number
      `;
      params = [zobristHash, zobristHash];
    } else if (searchType === 'pattern') {
      // Use optimized pattern search with piece location indexes
      const { buildOptimizedPatternQuery } = require('./src/positionIndex');
      const queryResult = buildOptimizedPatternQuery(fen, limit, offset);
      query = queryResult.query;
      params = queryResult.params;
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid search type. Use: exact, material, zobrist, or pattern' 
      });
    }
    
    let countQuery, countParams;
    
    if (searchType === 'pattern') {
      const { buildOptimizedPatternQuery } = require('./src/positionIndex');
      const queryResult = buildOptimizedPatternQuery(fen, limit, offset);
      countQuery = queryResult.countQuery;
      countParams = queryResult.countParams;
    } else {
      // Count distinct games matching the filter
      if (searchType === 'exact') {
        countQuery = `
          SELECT COUNT(DISTINCT g.id) as total
          FROM positions p
          JOIN games g ON p.game_id = g.id
          WHERE p.fen_position = ?
        `;
        countParams = [fenPosition];
      } else if (searchType === 'material') {
        countQuery = `
          SELECT COUNT(DISTINCT g.id) as total
          FROM positions p
          JOIN games g ON p.game_id = g.id
          WHERE p.material_signature = ?
        `;
        countParams = [getMaterialSignature(fen)];
      } else if (searchType === 'zobrist') {
        countQuery = `
          SELECT COUNT(DISTINCT g.id) as total
          FROM positions p
          JOIN games g ON p.game_id = g.id
          WHERE p.zobrist_hash = ?
        `;
        countParams = [computeZobristHash(fen)];
      }
    }
    
    db.get(countQuery, countParams, (err, countResult) => {
      if (err) {
        res.status(500).json({ success: false, error: err.message });
        return;
      }
      
      const totalGames = countResult.total;
      const totalPages = Math.ceil(totalGames / limit);
      
      db.all(query, params, (err, rows) => {
        if (err) {
          res.status(500).json({ success: false, error: err.message });
        } else {
          // No need for JavaScript filtering - results are already filtered by optimized SQL
          const gamesWithPositions = {};
          rows.forEach(row => {
            if (!gamesWithPositions[row.id]) {
              gamesWithPositions[row.id] = {
                ...row,
                positions: []
              };
              delete gamesWithPositions[row.id].move_number;
              delete gamesWithPositions[row.id].move;
              delete gamesWithPositions[row.id].fen_position;
            }
            gamesWithPositions[row.id].positions.push({
              moveNumber: row.move_number,
              move: row.move
            });
          });
          
          // Use the count from optimized query
          const actualTotalPages = Math.ceil(totalGames / limit);
          
          res.json({ 
            success: true, 
            games: Object.values(gamesWithPositions),
            searchType,
            pagination: {
              page: parseInt(page),
              pageSize: limit,
              totalGames: totalGames,
              totalPages: actualTotalPages,
              hasNext: parseInt(page) < actualTotalPages,
              hasPrev: parseInt(page) > 1
            }
          });
        }
      });
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get('/api/games/:id', (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM games WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
    } else if (!row) {
      res.status(404).json({ success: false, error: 'Game not found' });
    } else {
      res.json({ success: true, game: row });
    }
  });
});

app.delete('/api/games/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM games WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
    } else if (this.changes === 0) {
      res.status(404).json({ success: false, error: 'Game not found' });
    } else {
      res.json({ success: true, message: 'Game deleted successfully' });
    }
  });
});

app.get('/api/stats', (req, res) => {
  db.get('SELECT COUNT(*) as total FROM games', (err, row) => {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
    } else {
      db.all(`
        SELECT 
          (SELECT COUNT(DISTINCT white || black) FROM games) as total_players,
          (SELECT COUNT(DISTINCT event) FROM games) as total_events,
          (SELECT COUNT(*) FROM games WHERE result = '1-0') as white_wins,
          (SELECT COUNT(*) FROM games WHERE result = '0-1') as black_wins,
          (SELECT COUNT(*) FROM games WHERE result = '1/2-1/2') as draws
      `, (err, stats) => {
        if (err) {
          res.status(500).json({ success: false, error: err.message });
        } else {
          res.json({
            success: true,
            totalGames: row.total,
            ...stats[0]
          });
        }
      });
    }
  });
});

app.get('/api/stats/detailed', (req, res) => {
  const fs = require('fs');
  const stats = {};
  
  // Get database file size
  try {
    const dbStats = fs.statSync('./chess_database.db');
    stats.dbSize = (dbStats.size / (1024 * 1024)).toFixed(2) + ' MB';
  } catch (err) {
    stats.dbSize = 'Unknown';
  }
  
  db.serialize(() => {
    db.get('SELECT COUNT(*) as total FROM games', (err, row) => {
      stats.totalGames = err ? 0 : row.total;
      
      db.get('SELECT COUNT(*) as total FROM positions', (err, row) => {
        stats.totalPositions = err ? 0 : row.total;
        
        db.get('SELECT COUNT(DISTINCT fen_position) as total FROM positions', (err, row) => {
          stats.uniquePositions = err ? 0 : row.total;
          
          db.get('SELECT COUNT(DISTINCT game_id) as indexed FROM positions', (err, row) => {
            const indexedGames = err ? 0 : row.indexed;
            stats.indexedGames = indexedGames;
            stats.indexCoverage = stats.totalGames > 0 
              ? ((indexedGames / stats.totalGames) * 100).toFixed(1) + '%'
              : '0%';
            
            db.get(`SELECT MAX(id) as lastId, 
                    datetime(id / 1000000 + 2440587.5, 'unixepoch') as approxTime 
                    FROM positions`, (err, row) => {
              stats.lastIndexUpdate = row && row.lastId ? 'Recently' : 'Never';
              
              res.json({
                success: true,
                ...stats
              });
            });
          });
        });
      });
    });
  });
});

app.post('/api/index/rebuild', (req, res) => {
  const { extractAllPositions, computeZobristHash, getMaterialSignature, extractPieceLocations } = require('./src/positionIndex');
  
  // First clear existing positions
  db.run('DELETE FROM positions', (err) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    
    db.all('SELECT id, moves FROM games', (err, games) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      
      let processed = 0;
      let errors = 0;
      const total = games.length;
      
      res.json({
        success: true,
        message: 'Index rebuild started',
        total: total
      });
      
      // Process games in batches
      games.forEach((game) => {
        try {
          const positions = extractAllPositions(game.moves);
          const stmt = db.prepare(`
            INSERT INTO positions (game_id, move_number, fen, fen_position, zobrist_hash, material_signature, move)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          const pieceStmt = db.prepare(`
            INSERT INTO piece_locations (position_id, square, piece)
            VALUES (?, ?, ?)
          `);
          
          positions.forEach(pos => {
            const fenPosition = pos.fen.split(' ')[0];
            const zobristHash = computeZobristHash(pos.fen);
            const materialSig = getMaterialSignature(pos.fen);
            
            const result = stmt.run(
              game.id,
              pos.moveNumber,
              pos.fen,
              fenPosition,
              zobristHash,
              materialSig,
              pos.move
            );
            const positionId = result.lastID;
            const pieces = extractPieceLocations(fenPosition);
            pieces.forEach(({square, piece}) => {
              pieceStmt.run(positionId, square, piece);
            });
          });
          
          stmt.finalize();
          pieceStmt.finalize();
          processed++;
        } catch (error) {
          errors++;
        }
      });
    });
  });
});

app.post('/api/index/clear', (req, res) => {
  db.run('DELETE FROM positions', function(err) {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
    } else {
      res.json({ 
        success: true, 
        message: 'Position index cleared',
        deleted: this.changes
      });
    }
  });
});

app.post('/api/index/fix', (req, res) => {
  const { extractAllPositions, computeZobristHash, getMaterialSignature, extractPieceLocations } = require('./src/positionIndex');
  
  db.all(`
    SELECT g.id, g.moves 
    FROM games g 
    LEFT JOIN positions p ON g.id = p.game_id 
    WHERE p.game_id IS NULL
  `, (err, games) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    
    if (games.length === 0) {
      return res.json({
        success: true,
        message: 'All games are already indexed',
        fixed: 0
      });
    }
    
    let fixed = 0;
    games.forEach((game) => {
      try {
        const positions = extractAllPositions(game.moves);
        const stmt = db.prepare(`
          INSERT INTO positions (game_id, move_number, fen, fen_position, zobrist_hash, material_signature, move)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const pieceStmt = db.prepare(`
          INSERT INTO piece_locations (position_id, square, piece)
          VALUES (?, ?, ?)
        `);
        
        positions.forEach(pos => {
          const fenPosition = pos.fen.split(' ')[0];
          const zobristHash = computeZobristHash(pos.fen);
          const materialSig = getMaterialSignature(pos.fen);
          
          const result = stmt.run(
            game.id,
            pos.moveNumber,
            pos.fen,
            fenPosition,
            zobristHash,
            materialSig,
            pos.move
          );
          const positionId = result.lastID;
          const pieces = extractPieceLocations(fenPosition);
          pieces.forEach(({square, piece}) => {
            pieceStmt.run(positionId, square, piece);
          });
        });
        
        stmt.finalize();
        pieceStmt.finalize();
        fixed++;
      } catch (error) {
        console.error(`Error indexing game ${game.id}:`, error);
      }
    });
    
    res.json({
      success: true,
      message: `Fixed index for ${fixed} games`,
      fixed: fixed
    });
  });
});

app.post('/api/index/optimize', (req, res) => {
  db.run('VACUUM', (err) => {
    if (err) {
      res.status(500).json({ success: false, error: err.message });
    } else {
      db.run('ANALYZE', (err) => {
        if (err) {
          res.status(500).json({ success: false, error: err.message });
        } else {
          res.json({ 
            success: true, 
            message: 'Database optimized successfully'
          });
        }
      });
    }
  });
});

// Rebuild piece_locations using the server's DB connection to avoid external locks
app.post('/api/index/pieces/rebuild', async (req, res) => {
  const { extractPieceLocations } = require('./src/positionIndex');
  const BATCH = 2000;

  const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) { err ? reject(err) : resolve(this); });
  });
  const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
  const all = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });

  try {
    const totalRow = await get('SELECT COUNT(*) as count FROM positions');
    const total = totalRow.count;
    if (!total) {
      return res.json({ success: true, message: 'No positions found', total: 0 });
    }

    await run('DELETE FROM piece_locations');

    let processed = 0;
    for (let offset = 0; offset < total; offset += BATCH) {
      const batch = await all('SELECT id, fen_position FROM positions ORDER BY id LIMIT ? OFFSET ?', [BATCH, offset]);
      await new Promise((resolve, reject) => {
        const stmt = db.prepare('INSERT INTO piece_locations (position_id, square, piece) VALUES (?, ?, ?)');
        db.run('BEGIN TRANSACTION');
        try {
          for (const row of batch) {
            const pieces = extractPieceLocations(row.fen_position);
            for (const { square, piece } of pieces) {
              stmt.run(row.id, square, piece);
            }
          }
          db.run('COMMIT', (err) => {
            stmt.finalize();
            err ? reject(err) : resolve();
          });
        } catch (e) {
          db.run('ROLLBACK', () => {
            try { stmt.finalize(); } catch (_) {}
            reject(e);
          });
        }
      });
      processed += batch.length;
    }

    const countRow = await get('SELECT COUNT(*) as count FROM piece_locations');
    res.json({ success: true, message: 'piece_locations rebuilt', positionsProcessed: processed, pieceLocations: countRow.count });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Quick stats for piece_locations coverage and common checks
app.get('/api/index/pieces/stats', async (req, res) => {
  const runGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });

  try {
    const totalPieces = await runGet('SELECT COUNT(*) as count FROM piece_locations');
    const uniquePositions = await runGet('SELECT COUNT(DISTINCT position_id) as count FROM piece_locations');
    const totalPositions = await runGet('SELECT COUNT(*) as count FROM positions');

    const a1R = await runGet('SELECT COUNT(DISTINCT position_id) as count FROM piece_locations WHERE square = ? AND piece = ?', [0, 'R']);
    const b1R = await runGet('SELECT COUNT(DISTINCT position_id) as count FROM piece_locations WHERE square = ? AND piece = ?', [1, 'R']);
    const bothA1B1R = await runGet(
      `SELECT COUNT(DISTINCT pl1.position_id) as count
       FROM piece_locations pl1
       JOIN piece_locations pl2 ON pl1.position_id = pl2.position_id
       WHERE pl1.square = ? AND pl1.piece = ?
         AND pl2.square = ? AND pl2.piece = ?`, [0, 'R', 1, 'R']
    );

    const a8r = await runGet('SELECT COUNT(DISTINCT position_id) as count FROM piece_locations WHERE square = ? AND piece = ?', [56, 'r']);
    const h8r = await runGet('SELECT COUNT(DISTINCT position_id) as count FROM piece_locations WHERE square = ? AND piece = ?', [63, 'r']);
    const bothA8H8r = await runGet(
      `SELECT COUNT(DISTINCT pl1.position_id) as count
       FROM piece_locations pl1
       JOIN piece_locations pl2 ON pl1.position_id = pl2.position_id
       WHERE pl1.square = ? AND pl1.piece = ?
         AND pl2.square = ? AND pl2.piece = ?`, [56, 'r', 63, 'r']
    );

    const coverage = totalPositions.count > 0
      ? Number(((uniquePositions.count / totalPositions.count) * 100).toFixed(2))
      : 0;

    res.json({
      success: true,
      totals: {
        pieceLocations: totalPieces.count,
        uniquePositions: uniquePositions.count,
        positionsTable: totalPositions.count,
        coveragePercent: coverage
      },
      quickChecks: {
        whiteRookA1: a1R.count,
        whiteRookB1: b1R.count,
        whiteRooksA1B1: bothA1B1R.count,
        blackRookA8: a8r.count,
        blackRookH8: h8r.count,
        blackRooksA8H8: bothA8H8r.count
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Parametric check: AND-match of specific (square, piece) constraints
// Example: /api/index/pieces/check?constraints=a1:R,b1:R (algebraic) or /api/index/pieces/check?constraints=0:R,1:R (0-63 indices)
app.get('/api/index/pieces/check', async (req, res) => {
  function sqToIndex(s) {
    if (s == null) return null;
    if (/^\d+$/.test(s)) {
      const n = parseInt(s, 10);
      return n >= 0 && n <= 63 ? n : null;
    }
    const m = /^([a-h])([1-8])$/i.exec(String(s));
    if (!m) return null;
    const file = m[1].toLowerCase().charCodeAt(0) - 97; // a=0
    const rank = parseInt(m[2], 10);
    return (rank - 1) * 8 + file;
  }

  try {
    const raw = (req.query.constraints || '').toString().trim();
    if (!raw) return res.status(400).json({ success: false, error: 'constraints param is required (e.g., a1:R,b1:R)' });

    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    const constraints = [];
    for (const p of parts) {
      const [sqStr, piece] = p.split(':');
      const idx = sqToIndex(sqStr);
      if (idx == null || !piece || piece.length !== 1) {
        return res.status(400).json({ success: false, error: `Invalid constraint: ${p}` });
      }
      constraints.push({ square: idx, piece });
    }
    if (constraints.length === 0) return res.status(400).json({ success: false, error: 'No valid constraints provided' });

    // Build intersect-style dynamic query
    const baseAlias = 'pl0';
    let sql = `SELECT COUNT(DISTINCT ${baseAlias}.position_id) AS positions,
                      COUNT(DISTINCT pos.game_id) AS games
               FROM piece_locations ${baseAlias}
               JOIN positions pos ON pos.id = ${baseAlias}.position_id`;
    const params = [];

    // WHERE for first constraint
    sql += ` WHERE ${baseAlias}.square = ? AND ${baseAlias}.piece = ?`;
    params.push(constraints[0].square, constraints[0].piece);

    // Join for remaining constraints
    for (let i = 1; i < constraints.length; i++) {
      const alias = `pl${i}`;
      sql += `
        JOIN piece_locations ${alias}
          ON ${alias}.position_id = ${baseAlias}.position_id
         AND ${alias}.square = ? AND ${alias}.piece = ?`;
      params.push(constraints[i].square, constraints[i].piece);
    }

    // Execute
    await new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        res.json({ success: true, constraints, counts: row });
        resolve();
      });
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Chess Database Server running on http://${HOST}:${PORT}`);
});
