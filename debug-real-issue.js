// Add this to the console in the browser to debug the real issue

window.debugRealIssue = function() {
    console.log('=== DEBUGGING REAL ISSUE ===');
    
    // Check current state
    console.log('guessMode:', guessMode);
    console.log('bestMoveAtPosition:', bestMoveAtPosition);
    console.log('evaluationAtPosition:', evaluationAtPosition);
    console.log('game.turn():', game ? game.turn() : 'no game');
    console.log('game.fen():', game ? game.fen() : 'no game');
    
    if (!bestMoveAtPosition || evaluationAtPosition === null) {
        console.log('❌ Missing analysis data - this is the problem!');
        return;
    }
    
    // Create a test move (the best move itself)
    const testGameBest = new Chess(game.fen());
    const from = bestMoveAtPosition.substring(0, 2);
    const to = bestMoveAtPosition.substring(2, 4);
    const promotion = bestMoveAtPosition.length > 4 ? bestMoveAtPosition.substring(4, 5) : undefined;
    
    const bestMove = testGameBest.move({ from, to, promotion });
    console.log('Best move parsed:', bestMove);
    
    if (!bestMove) {
        console.log('❌ Best move parsing failed!');
        return;
    }
    
    // Create a test move (a different move)
    const testGameOther = new Chess(game.fen());
    let testMove = null;
    const allMoves = testGameOther.moves({ verbose: true });
    
    // Find a move that's NOT the best move
    for (const move of allMoves) {
        const moveUci = move.from + move.to + (move.promotion || '');
        if (moveUci !== bestMoveAtPosition) {
            testMove = move;
            break;
        }
    }
    
    console.log('Test move (not best):', testMove);
    
    // Test the evaluation logic
    if (testMove) {
        console.log('\n=== TESTING EVALUATION FUNCTION ===');
        
        // Mock the evaluateAlternativeMove function
        const mockPlayerEval = evaluationAtPosition - 0.3; // Slightly worse
        const bestEval = evaluationAtPosition;
        const isBlackToMove = game.turn() === 'b';
        
        console.log('Mock data:');
        console.log('  playerEval:', mockPlayerEval);
        console.log('  bestEval:', bestEval);
        console.log('  isBlackToMove:', isBlackToMove);
        
        // Apply the same logic as in evaluatePlayerMove
        let adjustedBestEval = bestEval;
        let adjustedPlayerEval = mockPlayerEval;
        
        if (isBlackToMove) {
            adjustedBestEval = -adjustedBestEval;
            adjustedPlayerEval = -adjustedPlayerEval;
        }
        
        const evalDiff = Math.abs(adjustedPlayerEval - adjustedBestEval);
        
        console.log('Adjusted values:');
        console.log('  adjustedPlayerEval:', adjustedPlayerEval);
        console.log('  adjustedBestEval:', adjustedBestEval);
        console.log('  evalDiff:', evalDiff);
        
        let quality = 'unknown';
        if (evalDiff <= 0.1) quality = 'excellent';
        else if (evalDiff <= 0.5) quality = 'good';
        else if (evalDiff <= 1.0) quality = 'ok';
        else quality = 'poor';
        
        console.log('  quality:', quality);
        
        // Now test with the actual best move (should be excellent)
        console.log('\n=== TESTING BEST MOVE (should be excellent) ===');
        const bestMoveEvalDiff = Math.abs(adjustedBestEval - adjustedBestEval); // Should be 0
        console.log('Best move eval diff:', bestMoveEvalDiff);
        console.log('Best move quality:', bestMoveEvalDiff <= 0.1 ? 'excellent' : 'not excellent - BUG!');
    }
    
    console.log('=== END DEBUG ===');
};