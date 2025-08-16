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
const PORT = 3000;

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
});

function indexGamePositions(gameId, moves) {
  const positions = extractAllPositions(moves);
  const posStmt = db.prepare(`
    INSERT INTO positions (game_id, move_number, fen, fen_position, zobrist_hash, material_signature, move)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  positions.forEach(pos => {
    const fenPosition = pos.fen.split(' ')[0];
    const zobristHash = computeZobristHash(pos.fen);
    const materialSig = getMaterialSignature(pos.fen);
    
    posStmt.run(
      gameId,
      pos.moveNumber,
      pos.fen,
      fenPosition,
      zobristHash,
      materialSig,
      pos.move
    );
  });
  
  posStmt.finalize();
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
        SELECT DISTINCT g.*, p.move_number, p.move
        FROM positions p
        JOIN games g ON p.game_id = g.id
        WHERE p.fen_position = ?
        ORDER BY g.id DESC, p.move_number
        LIMIT ${limit} OFFSET ${offset}
      `;
      params = [fenPosition];
    } else if (searchType === 'material') {
      const materialSig = getMaterialSignature(fen);
      query = `
        SELECT DISTINCT g.*, p.move_number, p.move
        FROM positions p
        JOIN games g ON p.game_id = g.id
        WHERE p.material_signature = ?
        ORDER BY g.id DESC, p.move_number
        LIMIT ${limit} OFFSET ${offset}
      `;
      params = [materialSig];
    } else if (searchType === 'zobrist') {
      const zobristHash = computeZobristHash(fen);
      query = `
        SELECT DISTINCT g.*, p.move_number, p.move
        FROM positions p
        JOIN games g ON p.game_id = g.id
        WHERE p.zobrist_hash = ?
        ORDER BY g.id DESC, p.move_number
        LIMIT ${limit} OFFSET ${offset}
      `;
      params = [zobristHash];
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid search type. Use: exact, material, or zobrist' 
      });
    }
    
    const countQuery = query.replace('SELECT DISTINCT g.*, p.move_number, p.move', 'SELECT COUNT(DISTINCT g.id) as total')
                            .replace(/LIMIT.*$/m, '');
    const countParams = params;
    
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
          const gamesWithPositions = {};
          rows.forEach(row => {
            if (!gamesWithPositions[row.id]) {
              gamesWithPositions[row.id] = {
                ...row,
                positions: []
              };
              delete gamesWithPositions[row.id].move_number;
              delete gamesWithPositions[row.id].move;
            }
            gamesWithPositions[row.id].positions.push({
              moveNumber: row.move_number,
              move: row.move
            });
          });
          
          res.json({ 
            success: true, 
            games: Object.values(gamesWithPositions),
            searchType,
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
  const { extractAllPositions, computeZobristHash, getMaterialSignature } = require('./src/positionIndex');
  
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
          
          positions.forEach(pos => {
            const fenPosition = pos.fen.split(' ')[0];
            const zobristHash = computeZobristHash(pos.fen);
            const materialSig = getMaterialSignature(pos.fen);
            
            stmt.run(
              game.id,
              pos.moveNumber,
              pos.fen,
              fenPosition,
              zobristHash,
              materialSig,
              pos.move
            );
          });
          
          stmt.finalize();
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
  const { extractAllPositions, computeZobristHash, getMaterialSignature } = require('./src/positionIndex');
  
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
        
        positions.forEach(pos => {
          const fenPosition = pos.fen.split(' ')[0];
          const zobristHash = computeZobristHash(pos.fen);
          const materialSig = getMaterialSignature(pos.fen);
          
          stmt.run(
            game.id,
            pos.moveNumber,
            pos.fen,
            fenPosition,
            zobristHash,
            materialSig,
            pos.move
          );
        });
        
        stmt.finalize();
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

app.listen(PORT, () => {
  console.log(`Chess Database Server running on http://localhost:${PORT}`);
});