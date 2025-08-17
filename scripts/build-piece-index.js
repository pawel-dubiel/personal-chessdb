#!/usr/bin/env node

/**
 * Chess Database Pro - Piece Location Index Builder
 * 
 * This script builds the piece_locations index for existing positions in the database.
 * This is needed for the optimized pattern search functionality.
 */

const sqlite3 = require('sqlite3').verbose();
const { extractPieceLocations } = require('../src/positionIndex');

const db = new sqlite3.Database('./chess_database.db');

// Improve concurrency: allow waiting for locks and use WAL for better write/read coexistence
db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');
  db.run('PRAGMA busy_timeout = 8000');
});

async function acquireWriteLock(maxWaitMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      await new Promise((resolve, reject) => {
        db.run('BEGIN IMMEDIATE', (err) => {
          if (err) return reject(err);
          db.run('COMMIT', (err2) => (err2 ? reject(err2) : resolve()));
        });
      });
      return true;
    } catch (e) {
      if (e && /SQLITE_BUSY/i.test(String(e.message))) {
        await new Promise(r => setTimeout(r, 250));
        continue;
      }
      throw e;
    }
  }
  return false;
}

console.log('🔧 Chess Database Pro - Building Piece Location Index');
console.log('====================================================\n');

async function clearExistingIndex() {
  return new Promise((resolve, reject) => {
    console.log('🗑️  Clearing existing piece location index...');
    db.run('DELETE FROM piece_locations', (err) => {
      if (err) {
        reject(err);
      } else {
        console.log('✅ Existing index cleared\n');
        resolve();
      }
    });
  });
}

async function getPositionCount() {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM positions', (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row.count);
      }
    });
  });
}

async function getPositionsBatch(offset, batchSize) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT id, fen_position FROM positions ORDER BY id LIMIT ? OFFSET ?',
      [batchSize, offset],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

async function insertPieceLocationsBatch(pieceLocations) {
  return new Promise((resolve, reject) => {
    if (pieceLocations.length === 0) {
      resolve();
      return;
    }
    
    const stmt = db.prepare('INSERT INTO piece_locations (position_id, square, piece) VALUES (?, ?, ?)');
    
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      pieceLocations.forEach(({position_id, square, piece}) => {
        stmt.run(position_id, square, piece);
      });
      
      db.run('COMMIT', (err) => {
        stmt.finalize();
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

async function buildPieceLocationIndex() {
  try {
    const gotLock = await acquireWriteLock();
    if (!gotLock) {
      throw new Error('Database is busy. Stop the server (or other writers) and try again.');
    }
    // Clear existing index
    await clearExistingIndex();
    
    // Get total position count
    const totalPositions = await getPositionCount();
    console.log(`📊 Found ${totalPositions.toLocaleString()} positions to index`);
    
    if (totalPositions === 0) {
      console.log('⚠️  No positions found in database. Import some games first.');
      return;
    }
    
    // Process in batches to avoid memory issues
    const batchSize = 1000;
    let processedPositions = 0;
    
    console.log(`🔄 Processing in batches of ${batchSize.toLocaleString()}...\n`);
    
    for (let offset = 0; offset < totalPositions; offset += batchSize) {
      const positions = await getPositionsBatch(offset, batchSize);
      const pieceLocations = [];
      
      // Extract piece locations for this batch
      positions.forEach(pos => {
        try {
          const pieces = extractPieceLocations(pos.fen_position);
          pieces.forEach(({square, piece}) => {
            pieceLocations.push({
              position_id: pos.id,
              square: square,
              piece: piece
            });
          });
        } catch (error) {
          console.error(`❌ Error processing position ${pos.id}:`, error.message);
        }
      });
      
      // Insert piece locations for this batch
      await insertPieceLocationsBatch(pieceLocations);
      
      processedPositions += positions.length;
      const progress = Math.round((processedPositions / totalPositions) * 100);
      
      console.log(`📈 Progress: ${processedPositions.toLocaleString()}/${totalPositions.toLocaleString()} positions (${progress}%) - ${pieceLocations.length.toLocaleString()} piece locations indexed`);
    }
    
    console.log('\n✅ Piece location index building complete!');
    
    // Verify the index
    await verifyIndex();
    
  } catch (error) {
    console.error('❌ Error building piece location index:', error);
    process.exit(1);
  }
}

async function verifyIndex() {
  return new Promise((resolve, reject) => {
    console.log('\n🔍 Verifying index...');
    
    db.get('SELECT COUNT(*) as count FROM piece_locations', (err, row) => {
      if (err) {
        reject(err);
      } else {
        console.log(`📊 Total piece locations indexed: ${row.count.toLocaleString()}`);
        
        // Test a simple query
        db.get('SELECT COUNT(*) as count FROM piece_locations WHERE piece = ? AND square = ?', ['P', 27], (err, testRow) => {
          if (err) {
            reject(err);
          } else {
            console.log(`🧪 Test query (white pawns on d4): ${testRow.count.toLocaleString()} results`);
            console.log('✅ Index verification complete!\n');
            resolve();
          }
        });
      }
    });
  });
}

async function showIndexStats() {
  return new Promise((resolve, reject) => {
    console.log('📈 Index Statistics:');
    console.log('===================');
    
    const queries = [
      { name: 'Total piece locations', sql: 'SELECT COUNT(*) as count FROM piece_locations' },
      { name: 'Unique positions', sql: 'SELECT COUNT(DISTINCT position_id) as count FROM piece_locations' },
      { name: 'White pawns', sql: 'SELECT COUNT(*) as count FROM piece_locations WHERE piece = "P"' },
      { name: 'Black pawns', sql: 'SELECT COUNT(*) as count FROM piece_locations WHERE piece = "p"' },
      { name: 'Knights (both colors)', sql: 'SELECT COUNT(*) as count FROM piece_locations WHERE piece IN ("N", "n")' },
      { name: 'Queens (both colors)', sql: 'SELECT COUNT(*) as count FROM piece_locations WHERE piece IN ("Q", "q")' }
    ];
    
    let completed = 0;
    queries.forEach(({name, sql}) => {
      db.get(sql, (err, row) => {
        if (err) {
          console.error(`❌ Error running ${name}: ${err.message}`);
        } else {
          console.log(`   ${name}: ${row.count.toLocaleString()}`);
        }
        
        completed++;
        if (completed === queries.length) {
          console.log('');
          resolve();
        }
      });
    });
  });
}

// Command line interface
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'stats':
      showIndexStats().then(() => {
        db.close();
        process.exit(0);
      }).catch(error => {
        console.error('Error:', error);
        process.exit(1);
      });
      break;
      
    case 'verify':
      verifyIndex().then(() => {
        db.close();
        process.exit(0);
      }).catch(error => {
        console.error('Error:', error);
        process.exit(1);
      });
      break;
      
    case 'clear':
      clearExistingIndex().then(() => {
        console.log('🗑️  Piece location index cleared');
        db.close();
        process.exit(0);
      }).catch(error => {
        console.error('Error:', error);
        process.exit(1);
      });
      break;
      
    default:
      buildPieceLocationIndex().then(async () => {
        await showIndexStats();
        console.log('🎉 Index building complete! Your pattern searches should now be much faster.');
        console.log('\n💡 Next steps:');
        console.log('   - Test pattern search in the web interface');
        console.log('   - Run performance benchmarks: npm run test:performance');
        console.log('   - Use "node scripts/build-piece-index.js stats" to see detailed statistics');
        
        db.close();
        process.exit(0);
      }).catch(error => {
        console.error('Fatal error:', error);
        db.close();
        process.exit(1);
      });
  }
}

module.exports = { buildPieceLocationIndex, showIndexStats, verifyIndex };
