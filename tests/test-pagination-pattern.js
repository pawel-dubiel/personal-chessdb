#!/usr/bin/env node

/**
 * Pagination tests for optimized pattern search
 * Ensures we paginate by distinct games and return only matching positions
 */

const sqlite3 = require('sqlite3').verbose();
const { buildOptimizedPatternQuery } = require('../src/positionIndex');

console.log('🧪 Chess Database Pro - Pattern Pagination Tests');
console.log('================================================');

function runTests() {
  let total = 0;
  let passed = 0;

  function test(name, condition, details = '') {
    total++;
    const ok = !!condition;
    if (ok) passed++;
    const status = ok ? '✅' : '❌';
    console.log(`  ${status} ${name}${details ? ' — ' + details : ''}`);
    return ok;
  }

  const db = new sqlite3.Database(':memory:');

  db.serialize(() => {
    // Minimal schema required by the queries
    db.run(`CREATE TABLE games (
      id INTEGER PRIMARY KEY,
      white TEXT,
      black TEXT,
      result TEXT
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

    // Seed games: 30 (2 matches), 20 (1 match), 10 (0 matches)
    db.run(`INSERT INTO games(id, white, black, result) VALUES (30,'A','B','1-0')`);
    db.run(`INSERT INTO games(id, white, black, result) VALUES (20,'C','D','0-1')`);
    db.run(`INSERT INTO games(id, white, black, result) VALUES (10,'E','F','1/2-1/2')`);

    // Positions for game 30
    db.run(`INSERT INTO positions(id, game_id, move_number, fen, fen_position, move) VALUES (3001,30,5,'','', 'e4')`);
    db.run(`INSERT INTO positions(id, game_id, move_number, fen, fen_position, move) VALUES (3002,30,10,'','', 'd4')`);
    // Both positions match pattern: P on d4 (square 27)
    db.run(`INSERT INTO piece_locations(position_id, square, piece) VALUES (3001, 27, 'P')`);
    db.run(`INSERT INTO piece_locations(position_id, square, piece) VALUES (3002, 27, 'P')`);

    // Position for game 20 (matches)
    db.run(`INSERT INTO positions(id, game_id, move_number, fen, fen_position, move) VALUES (2001,20,12,'','', 'Nc3')`);
    db.run(`INSERT INTO piece_locations(position_id, square, piece) VALUES (2001, 27, 'P')`);

    // Position for game 10 (non-matching)
    db.run(`INSERT INTO positions(id, game_id, move_number, fen, fen_position, move) VALUES (1001,10,8,'','', 'h3')`);
    db.run(`INSERT INTO piece_locations(position_id, square, piece) VALUES (1001, 28, 'P')`);

    const pattern = '8/8/8/8/3P4/8/8/8';

    // Page 1: expect only game 30 (highest id) and its two matching positions
    const q1 = buildOptimizedPatternQuery(pattern, 1, 0);
    db.get(q1.countQuery, q1.countParams, (err, countRow) => {
      test('countQuery runs', !err);
      test('total distinct games = 2', countRow && countRow.total === 2, JSON.stringify(countRow));

      db.all(q1.query, q1.params, (err, rows) => {
        test('page 1 query runs', !err, err ? err.message : '');
        const gameIds = [...new Set(rows.map(r => r.id))];
        test('page 1 returns exactly one game', gameIds.length === 1);
        test('page 1 game is 30', gameIds[0] === 30, JSON.stringify(gameIds));
        test('page 1 rows equal matching positions in game 30', rows.length === 2, `rows=${rows.length}`);
        test('positions ordered by move_number', rows[0].move_number <= rows[1].move_number);

        // Page 2: expect only game 20 and its single matching position
        const q2 = buildOptimizedPatternQuery(pattern, 1, 1);
        db.all(q2.query, q2.params, (err2, rows2) => {
          test('page 2 query runs', !err2, err2 ? err2.message : '');
          const gameIds2 = [...new Set(rows2.map(r => r.id))];
          test('page 2 returns exactly one game', gameIds2.length === 1);
          test('page 2 game is 20', gameIds2[0] === 20, JSON.stringify(gameIds2));
          test('page 2 has one matching position', rows2.length === 1, `rows=${rows2.length}`);

          console.log('\n============================================================');
          console.log(`🏁 Test Results: ${passed}/${total} tests passed`);
          process.exit(passed === total ? 0 : 1);
        });
      });
    });
  });
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
