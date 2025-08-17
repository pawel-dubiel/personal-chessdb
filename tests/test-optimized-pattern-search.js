#!/usr/bin/env node

/**
 * Chess Database Pro - Optimized Pattern Search Tests
 * 
 * This test suite verifies the optimized pattern search implementation
 * using piece location indexes vs the old JavaScript filtering approach.
 */

const { 
  extractPieceLocations, 
  parsePatternRequirements, 
  buildOptimizedPatternQuery 
} = require('../src/positionIndex');

console.log('🧪 Chess Database Pro - Optimized Pattern Search Tests');
console.log('====================================================\n');

function runTests() {
  let totalTests = 0;
  let passedTests = 0;

  function test(name, actual, expected, description = '') {
    totalTests++;
    const passed = JSON.stringify(actual) === JSON.stringify(expected);
    if (passed) passedTests++;
    
    const status = passed ? '✅' : '❌';
    const desc = description ? ` (${description})` : '';
    console.log(`  ${status} ${name}: ${JSON.stringify(actual)} ${desc}`);
    
    if (!passed) {
      console.log(`     Expected: ${JSON.stringify(expected)}`);
    }
    
    return passed;
  }

  // Test 1: Piece Location Extraction
  console.log('=== Test 1: Piece Location Extraction ===');
  
  const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
  const pieces = extractPieceLocations(startingFen);
  
  test('Starting position piece count', pieces.length, 32, 'Should find all 32 pieces');
  
  // Check specific pieces
  const a1Rook = pieces.find(p => p.square === 0);
  test('a1 square has white rook', a1Rook?.piece, 'R');
  
  const e1King = pieces.find(p => p.square === 4);
  test('e1 square has white king', e1King?.piece, 'K');
  
  const e8King = pieces.find(p => p.square === 60);
  test('e8 square has black king', e8King?.piece, 'k');
  
  const h8Rook = pieces.find(p => p.square === 63);
  test('h8 square has black rook', h8Rook?.piece, 'r');

  // Test 2: Pattern Requirements Parsing
  console.log('\n=== Test 2: Pattern Requirements Parsing ===');
  
  // Simple pattern: pawn on d4
  const pattern1 = '8/8/8/8/3P4/8/8/8';
  const req1 = parsePatternRequirements(pattern1);
  test('Simple pawn pattern', req1, [{ square: 27, allowedPieces: ['P'] }]);
  
  // Multi-piece pattern: [P|N] on d4
  const pattern2 = '8/8/8/8/3[P|N]4/8/8/8';
  const req2 = parsePatternRequirements(pattern2);
  test('Multi-piece OR pattern', req2, [{ square: 27, allowedPieces: ['P', 'N'] }]);
  
  // Complex pattern: d4=[P|N] AND e4=[B|R]
  const pattern3 = '8/8/8/8/3[P|N][B|R]3/8/8/8';
  const req3 = parsePatternRequirements(pattern3);
  test('Multi-square pattern', req3, [
    { square: 27, allowedPieces: ['P', 'N'] },
    { square: 28, allowedPieces: ['B', 'R'] }
  ]);
  
  // Test 3: Query Building
  console.log('\n=== Test 3: SQL Query Building ===');
  
  const query1 = buildOptimizedPatternQuery('8/8/8/8/3P4/8/8/8', 10, 0);
  test('Query has correct structure', typeof query1.query, 'string');
  const expectParams = (len, expected) => (len === expected || len === expected * 2);
  test('Query params length', expectParams(query1.params.length, 2), true, `len=${query1.params.length} (square + piece; duplicated if nested subquery used)`);
  test('Count query exists', typeof query1.countQuery, 'string');
  
  const query2 = buildOptimizedPatternQuery('8/8/8/8/3[P|N]4/8/8/8', 10, 0);
  test('Multi-piece params length', expectParams(query2.params.length, 3), true, `len=${query2.params.length} (square + 2 pieces; may be duplicated)`);
  
  const query3 = buildOptimizedPatternQuery('8/8/8/8/3[P|N][B|R]3/8/8/8', 10, 0);
  test('Multi-constraint params', expectParams(query3.params.length, 6), true, `len=${query3.params.length} (2 squares + 4 pieces; may be duplicated)`);

  // Test 4: Edge Cases
  console.log('\n=== Test 4: Edge Cases ===');
  
  // Empty pattern
  const emptyQuery = buildOptimizedPatternQuery('8/8/8/8/8/8/8/8', 10, 0);
  test('Empty pattern query', emptyQuery.query, 'SELECT 1 WHERE 0');
  test('Empty pattern params', emptyQuery.params, []);
  
  // Single piece multiple squares
  const multiSquarePattern = '8/8/8/8/PP6/8/8/8';
  const multiReq = parsePatternRequirements(multiSquarePattern);
  test('Multiple squares pattern', multiReq, [
    { square: 24, allowedPieces: ['P'] },
    { square: 25, allowedPieces: ['P'] }
  ]);

  // Test 5: Square Number Calculation
  console.log('\n=== Test 5: Square Number Validation ===');
  
  // Test known square numbers
  const testFen = 'r7/8/8/8/3P4/8/8/7R';
  const testPieces = extractPieceLocations(testFen);
  
  const a8Piece = testPieces.find(p => p.square === 56);
  test('a8 square number (56)', a8Piece?.piece, 'r');
  
  const d4Piece = testPieces.find(p => p.square === 27);
  test('d4 square number (27)', d4Piece?.piece, 'P');
  
  const h1Piece = testPieces.find(p => p.square === 7);
  test('h1 square number (7)', h1Piece?.piece, 'R');

  // Test 6: Complex Pattern Validation
  console.log('\n=== Test 6: Complex Pattern Validation ===');
  
  // Test bracket notation edge cases
  const complexPattern = '8/8/8/8/[P|p|N|n]7/8/8/8';
  const complexReq = parsePatternRequirements(complexPattern);
  test('Complex bracket pattern', complexReq, [
    { square: 24, allowedPieces: ['P', 'p', 'N', 'n'] }
  ]);
  
  // Test with numbers in pattern (d5 = rank 4, file 3 = square 35)
  const numberPattern = '8/8/8/3[Q|q]4/8/8/8/8';
  const numberReq = parsePatternRequirements(numberPattern);
  test('Pattern with numbers', numberReq, [
    { square: 35, allowedPieces: ['Q', 'q'] }
  ]);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`🏁 Test Results: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('✅ All tests PASSED! Optimized pattern search is working correctly.');
    return true;
  } else {
    console.log('❌ Some tests FAILED! Check the implementation.');
    return false;
  }
}

// Run the tests
if (require.main === module) {
  const success = runTests();
  process.exit(success ? 0 : 1);
}

module.exports = { runTests };
