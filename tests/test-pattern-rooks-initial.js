#!/usr/bin/env node

/**
 * Verifies rook-on-initial-squares pattern finds all games that include
 * the standard start position. Uses the optimized SQL query builder.
 */

const sqlite3 = require('sqlite3').verbose();
const { buildOptimizedPatternQuery, extractPieceLocations } = require('../src/positionIndex');

console.log('🧪 Pattern Test — Rooks on a1/h1 (initial)');
console.log('==========================================');

function runTests() {
  let total = 0;
  let passed = 0;

  function test(name, condition, details = '') {
    total++;
    const ok = !!condition;
    if (ok) passed++;
    console.log(`  ${ok ? '✅' : '❌'} ${name}${details ? ' — ' + details : ''}`);
    return ok;
  }

  const db = new sqlite3.Database(':memory:');
  const startFenPosition = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

  db.serialize(() => {
    db.run(`CREATE TABLE games (
      id INTEGER PRIMARY KEY, white TEXT, black TEXT, result TEXT
    )`);
    db.run(`CREATE TABLE positions (
      id INTEGER PRIMARY KEY,
      game_id INTEGER,
      move_number INTEGER,
      fen TEXT,
      fen_position TEXT,
      zobrist_hash TEXT,
      material_signature TEXT,
      move TEXT
    )`);
    db.run(`CREATE TABLE piece_locations (
      position_id INTEGER,
      square INTEGER,
      piece CHAR(1)
    )`);

    // Seed two games with initial position indexed into piece_locations
    db.run("INSERT INTO games(id,white,black,result) VALUES (1,'A','B','1-0')");
    db.run("INSERT INTO games(id,white,black,result) VALUES (2,'C','D','0-1')");

    const posInsert = db.prepare('INSERT INTO positions(id, game_id, move_number, fen, fen_position, move) VALUES (?, ?, ?, ?, ?, ?)');
    posInsert.run(101, 1, 0, startFenPosition + ' w - - 0 1', startFenPosition, null);
    posInsert.run(201, 2, 0, startFenPosition + ' w - - 0 1', startFenPosition, null);
    posInsert.finalize();

    const pieceStmt = db.prepare('INSERT INTO piece_locations(position_id, square, piece) VALUES (?, ?, ?)');
    [
      { id: 101 },
      { id: 201 }
    ].forEach(({ id }) => {
      extractPieceLocations(startFenPosition).forEach(({ square, piece }) => {
        pieceStmt.run(id, square, piece);
      });
    });
    pieceStmt.finalize();

    // Pattern: rooks on a1 and h1 for white; other squares unconstrained
    const pattern = '8/8/8/8/8/8/8/R6R';
    const q = buildOptimizedPatternQuery(pattern, 10, 0);

    db.get(q.countQuery, q.countParams, (err, countRow) => {
      test('countQuery runs', !err, err ? err.message : '');
      test('total games = 2', countRow && countRow.total === 2, JSON.stringify(countRow));

      db.all(q.query, q.params, (err2, rows) => {
        test('result query runs', !err2, err2 ? err2.message : '');
        const gameIds = [...new Set(rows.map(r => r.id))].sort();
        test('found both games', gameIds.length === 2 && gameIds[0] === 1 && gameIds[1] === 2, JSON.stringify(gameIds));

        console.log('\n============================================================');
        console.log(`🏁 Test Results: ${passed}/${total} tests passed`);
        process.exit(passed === total ? 0 : 1);
      });
    });
  });
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };

