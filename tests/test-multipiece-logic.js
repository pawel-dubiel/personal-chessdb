const { searchPositionPattern } = require('../src/positionIndex');

console.log('🧪 Testing Multi-Piece Pattern Matching Logic\n');

// Helper function to get piece on a specific square from FEN
function getPieceOnSquare(fen, targetSquare) {
    const ranks = fen.split(' ')[0].split('/');
    const files = 'abcdefgh';
    const targetFile = files.indexOf(targetSquare[0]);
    const targetRank = 8 - parseInt(targetSquare[1]);
    
    if (targetRank < 0 || targetRank > 7 || targetFile < 0 || targetFile > 7) {
        return 'invalid';
    }
    
    const rankString = ranks[targetRank];
    let currentFile = 0;
    
    for (let char of rankString) {
        if (char >= '1' && char <= '8') {
            const emptySquares = parseInt(char);
            if (currentFile <= targetFile && targetFile < currentFile + emptySquares) {
                return 'empty';
            }
            currentFile += emptySquares;
        } else {
            if (currentFile === targetFile) {
                return char;
            }
            currentFile++;
        }
    }
    
    return 'empty';
}

function runTests() {
    let totalTests = 0;
    let passedTests = 0;

    function test(name, actual, expected, description = '') {
        totalTests++;
        const passed = actual === expected;
        if (passed) passedTests++;
        
        const status = passed ? '✅' : '❌';
        const desc = description ? ` (${description})` : '';
        console.log(`  ${status} ${name}: ${actual} ${desc}`);
        
        return passed;
    }

    // Test 1: Simple OR condition - d4 can be Pawn OR Knight
    console.log('=== Test 1: d4 can be Pawn OR Knight ===');
    const pattern1 = '8/8/8/8/3[P|N]4/8/8/8 w - - 0 1';
    const matcher1 = searchPositionPattern(pattern1, 'pattern');

    const testPositions1 = [
        'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR',  // Pawn on d4
        'rnbqkbnr/pppppppp/8/8/3N4/8/PPP1PPPP/RNBQKB1R',  // Knight on d4  
        'rnbqkbnr/pppppppp/8/8/3B4/8/PPP1PPPP/RNBQK1NR',  // Bishop on d4
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',      // Empty d4
    ];

    console.log('Pattern: d4 can be [P|N] (Pawn OR Knight)');
    testPositions1.forEach((pos, i) => {
        const fullFen = pos + ' w - - 0 1';
        const result = matcher1(fullFen);
        const d4Piece = getPieceOnSquare(pos, 'd4');
        const expected = (d4Piece === 'P' || d4Piece === 'N');
        test(`Test ${i+1} d4=${d4Piece}`, result, expected);
    });

    // Test 2: All pieces on d4
    console.log('\n=== Test 2: Testing all pieces against [P|N] pattern ===');
    const pieces = ['P', 'N', 'B', 'R', 'Q', 'K', 'p', 'n', 'b', 'r', 'q', 'k'];
    const pattern2 = '8/8/8/8/3[P|N]4/8/8/8 w - - 0 1';
    const matcher2 = searchPositionPattern(pattern2, 'pattern');

    pieces.forEach(piece => {
        const testPos = `8/8/8/8/3${piece}4/8/8/8`;
        const fullFen = testPos + ' w - - 0 1';
        const result = matcher2(fullFen);
        const expected = (piece === 'P' || piece === 'N');
        test(`d4=${piece}`, result, expected);
    });

    // Test 3: Multiple constraints
    console.log('\n=== Test 3: Multiple constraints d4=[P|N] AND e4=[B|R] ===');
    const pattern3 = '8/8/8/8/3[P|N][B|R]3/8/8/8 w - - 0 1';
    const matcher3 = searchPositionPattern(pattern3, 'pattern');

    const testCombinations = [
        ['P', 'B', true],  // Should match
        ['P', 'R', true],  // Should match  
        ['N', 'B', true],  // Should match
        ['N', 'R', true],  // Should match
        ['P', 'N', false], // Should NOT match
        ['B', 'R', false], // Should NOT match
        ['Q', 'Q', false], // Should NOT match
    ];

    testCombinations.forEach(([d4piece, e4piece, expected], i) => {
        const testPos = `8/8/8/8/3${d4piece}${e4piece}3/8/8/8`;
        const fullFen = testPos + ' w - - 0 1';
        const result = matcher3(fullFen);
        test(`Test ${i+1} d4=${d4piece},e4=${e4piece}`, result, expected);
    });

    // Test 4: Color-agnostic patterns
    console.log('\n=== Test 4: Color-agnostic patterns [P|p] ===');
    const pattern4 = '8/8/8/8/3[P|p]4/8/8/8 w - - 0 1';
    const matcher4 = searchPositionPattern(pattern4, 'pattern');

    const colorTests = [
        ['P', true],   // White pawn
        ['p', true],   // Black pawn
        ['N', false],  // White knight
        ['n', false],  // Black knight
        ['empty', false], // Empty square
    ];

    colorTests.forEach(([piece, expected]) => {
        let testPos;
        if (piece === 'empty') {
            testPos = '8/8/8/8/8/8/8/8';
        } else {
            testPos = `8/8/8/8/3${piece}4/8/8/8`;
        }
        const fullFen = testPos + ' w - - 0 1';
        const result = matcher4(fullFen);
        test(`d4=${piece}`, result, expected);
    });

    // Test 5: Complex multi-square patterns
    console.log('\n=== Test 5: Complex pattern - multiple squares ===');
    const pattern5 = '8/8/8/8/[P|p][N|n][B|b]5/8/8/8 w - - 0 1';
    const matcher5 = searchPositionPattern(pattern5, 'pattern');

    const complexTests = [
        ['P', 'N', 'B', true],   // All white pieces
        ['p', 'n', 'b', true],   // All black pieces  
        ['P', 'n', 'B', true],   // Mixed colors
        ['P', 'N', 'Q', false],  // Third piece wrong
        ['R', 'N', 'B', false],  // First piece wrong
    ];

    complexTests.forEach(([a4, b4, c4, expected], i) => {
        const testPos = `8/8/8/8/${a4}${b4}${c4}5/8/8/8`;
        const fullFen = testPos + ' w - - 0 1';
        const result = matcher5(fullFen);
        test(`Complex ${i+1} a4=${a4},b4=${b4},c4=${c4}`, result, expected);
    });

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`🏁 Test Results: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
        console.log('✅ All tests PASSED! Multi-piece OR logic is working correctly.');
        return true;
    } else {
        console.log('❌ Some tests FAILED! Check the implementation.');
        return false;
    }
}

// Run the tests
if (require.main === module) {
    runTests();
}

module.exports = { runTests };