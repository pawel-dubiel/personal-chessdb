const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const { parsePGN, searchGames, extractGameInfo } = require('./src/pgnUtils');

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
});

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
          game
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
          game
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

app.listen(PORT, () => {
  console.log(`Chess Database Server running on http://localhost:${PORT}`);
});