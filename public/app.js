let currentGame = null;
let board = null;
let game = null;
let moveHistory = [];
let currentMoveIndex = -1;
let autoPlay = false;
let currentPage = 1;
let currentPageSize = 50;
let currentSearchParams = {};
let stockfish = null;
let analysisMode = false;
let currentBestMove = null;
let guessMode = false;
let lastPosition = null;
let bestMoveAtPosition = null;
let evaluationAtPosition = null;

document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    searchGames();
    
    document.getElementById('importBtn').addEventListener('click', importPGN);
    document.getElementById('uploadBtn').addEventListener('click', uploadPGN);
    document.getElementById('searchForm').addEventListener('submit', (e) => {
        e.preventDefault();
        searchGames();
    });
    
    document.getElementById('closeViewer').addEventListener('click', closeGameViewer);
    document.getElementById('startBtn').addEventListener('click', () => navigateMove(0));
    document.getElementById('prevBtn').addEventListener('click', () => navigateMove(currentMoveIndex - 1));
    document.getElementById('nextBtn').addEventListener('click', () => navigateMove(currentMoveIndex + 1));
    document.getElementById('endBtn').addEventListener('click', () => navigateMove(moveHistory.length - 1));
    document.getElementById('playBtn').addEventListener('click', toggleAutoPlay);
    
    setupFileUpload();
    setupTabs();
    setupPagination();
    setupStockfish();
    setupPositionSearch();
    setupSettings();
    
    // Add guess mode toggle
    document.getElementById('toggleGuessMode').addEventListener('click', toggleGuessMode);
    
    // Add keyboard support for navigation
    document.addEventListener('keydown', handleKeyDown);
    
    // Add debug test function (remove in production)
    window.debugGuessMode = function() {
        console.log('=== GUESS MODE DEBUG TEST ===');
        console.log('guessMode:', guessMode);
        console.log('analysisMode:', analysisMode);
        console.log('currentGame:', currentGame ? 'loaded' : 'none');
        console.log('game position:', game ? game.fen() : 'none');
        console.log('game turn:', game ? game.turn() : 'none');
        console.log('bestMoveAtPosition:', bestMoveAtPosition);
        console.log('evaluationAtPosition:', evaluationAtPosition);
        console.log('lastPosition:', lastPosition);
        
        if (game && bestMoveAtPosition) {
            // Test the evaluation with the best move
            console.log('\n=== TESTING BEST MOVE ===');
            const tempGame = new Chess(game.fen());
            const from = bestMoveAtPosition.substring(0, 2);
            const to = bestMoveAtPosition.substring(2, 4);
            const promotion = bestMoveAtPosition.length > 4 ? bestMoveAtPosition.substring(4, 5) : undefined;
            
            const testMove = tempGame.move({ from, to, promotion });
            console.log('Best move parsed:', testMove);
            console.log('Best move UCI:', bestMoveAtPosition);
            console.log('Best move formatted:', formatMove(bestMoveAtPosition));
            
            // Simulate evaluation
            evaluatePlayerMove(testMove);
        }
        console.log('=== END DEBUG TEST ===\n');
    };

    // Real issue debugger
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
        
        // Test the evaluation logic with mock data to prove it works
        const mockPlayerEval = evaluationAtPosition - 0.3; // Slightly worse than best
        const bestEval = evaluationAtPosition;
        const isBlackToMove = game.turn() === 'b';
        
        console.log('\n=== TESTING EVALUATION LOGIC ===');
        console.log('Mock data: playerEval =', mockPlayerEval, ', bestEval =', bestEval, ', isBlackToMove =', isBlackToMove);
        
        // Apply the same logic as in evaluatePlayerMove
        let adjustedBestEval = bestEval;
        let adjustedPlayerEval = mockPlayerEval;
        
        if (isBlackToMove) {
            adjustedBestEval = -adjustedBestEval;
            adjustedPlayerEval = -adjustedPlayerEval;
        }
        
        const evalDiff = Math.abs(adjustedPlayerEval - adjustedBestEval);
        console.log('Adjusted: playerEval =', adjustedPlayerEval, ', bestEval =', adjustedBestEval, ', diff =', evalDiff);
        
        let quality = 'unknown';
        if (evalDiff <= 0.1) quality = 'excellent';
        else if (evalDiff <= 0.5) quality = 'good';
        else if (evalDiff <= 1.0) quality = 'ok';
        else quality = 'poor';
        
        console.log('Expected quality:', quality);
        
        // Test if the issue is in the evaluateAlternativeMove async function
        console.log('\n=== TESTING evaluateAlternativeMove ===');
        const testMoveUci = bestMoveAtPosition; // Use best move for guaranteed result
        console.log('Testing with move:', testMoveUci);
        
        evaluateAlternativeMove(testMoveUci, (result) => {
            console.log('evaluateAlternativeMove callback result:', result);
            if (result === null) {
                console.log('❌ evaluateAlternativeMove returned null - this might be the bug!');
            } else {
                console.log('✅ evaluateAlternativeMove worked, result:', result);
            }
        });
        
        console.log('=== END REAL ISSUE DEBUG ===');
    };
});

function handleKeyDown(event) {
    // Only handle keys when game viewer is open and not typing in input fields
    if (!currentGame || event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
    }
    
    switch(event.key) {
        case 'ArrowLeft':
            event.preventDefault();
            navigateMove(currentMoveIndex - 1);
            break;
        case 'ArrowRight':
            event.preventDefault();
            navigateMove(currentMoveIndex + 1);
            break;
        case 'Home':
            event.preventDefault();
            navigateMove(-1);
            break;
        case 'End':
            event.preventDefault();
            navigateMove(moveHistory.length - 1);
            break;
        case ' ':
        case 'Space':
            event.preventDefault();
            toggleAutoPlay();
            break;
    }
}

async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('totalGames').textContent = data.totalGames;
            document.getElementById('totalPlayers').textContent = data.total_players;
            document.getElementById('totalEvents').textContent = data.total_events;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function importPGN() {
    const pgnInput = document.getElementById('pgnInput');
    const resultDiv = document.getElementById('importResult');
    
    if (!pgnInput.value.trim()) {
        showMessage(resultDiv, 'Please enter PGN text', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/games/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ pgn: pgnInput.value })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage(resultDiv, `Successfully imported ${data.imported} of ${data.total} games`, 'success');
            pgnInput.value = '';
            loadStats();
            searchGames();
        } else {
            showMessage(resultDiv, `Error: ${data.error}`, 'error');
        }
    } catch (error) {
        showMessage(resultDiv, `Error: ${error.message}`, 'error');
    }
}

async function searchGames(page = 1) {
    currentPage = page;
    currentSearchParams = {
        white: document.getElementById('whitePlayer').value,
        black: document.getElementById('blackPlayer').value,
        opening: document.getElementById('opening').value,
        eco: document.getElementById('eco').value,
        result: document.getElementById('result').value,
        dateFrom: document.getElementById('dateFrom').value,
        dateTo: document.getElementById('dateTo').value,
        page: currentPage,
        pageSize: currentPageSize
    };
    
    const params = new URLSearchParams(currentSearchParams);
    
    try {
        const response = await fetch(`/api/games/search?${params}`);
        const data = await response.json();
        
        if (data.success) {
            displayGames(data.games, data.pagination);
        }
    } catch (error) {
        console.error('Error searching games:', error);
    }
}

function displayGames(games, pagination) {
    const tbody = document.getElementById('gamesTableBody');
    tbody.innerHTML = '';
    
    if (games.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">No games found</td></tr>';
        document.getElementById('paginationTop').style.display = 'none';
        document.getElementById('paginationBottom').style.display = 'none';
        return;
    }
    
    games.forEach(game => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${game.id}</td>
            <td>${game.white}</td>
            <td>${game.black}</td>
            <td>${game.result}</td>
            <td>${game.date || '-'}</td>
            <td>${game.event || '-'}</td>
            <td>${game.eco || '-'}</td>
            <td>
                <button class="btn btn-small btn-primary" onclick="viewGame(${game.id})">View</button>
                <button class="btn btn-small btn-danger" onclick="deleteGame(${game.id})">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
    
    if (pagination) {
        updatePagination(pagination);
        document.getElementById('paginationTop').style.display = 'flex';
        document.getElementById('paginationBottom').style.display = 'flex';
    }
}

async function viewGame(gameId) {
    try {
        const response = await fetch(`/api/games/${gameId}`);
        const data = await response.json();
        
        if (data.success) {
            currentGame = data.game;
            openGameViewer();
        }
    } catch (error) {
        console.error('Error loading game:', error);
    }
}

function openGameViewer() {
    document.getElementById('gameViewer').style.display = 'block';
    document.getElementById('gameTitle').textContent = `${currentGame.white} vs ${currentGame.black}`;
    
    const details = document.getElementById('gameDetails');
    details.innerHTML = `
        <div><strong>White:</strong> ${currentGame.white}</div>
        <div><strong>Black:</strong> ${currentGame.black}</div>
        <div><strong>Result:</strong> ${currentGame.result}</div>
        <div><strong>Date:</strong> ${currentGame.date || 'Unknown'}</div>
        <div><strong>Event:</strong> ${currentGame.event || 'Unknown'}</div>
        <div><strong>Opening:</strong> ${currentGame.opening || 'Unknown'}</div>
        <div><strong>ECO:</strong> ${currentGame.eco || '-'}</div>
    `;
    
    initializeBoard();
    loadGameMoves();
}

function closeGameViewer() {
    document.getElementById('gameViewer').style.display = 'none';
    if (board) {
        board.destroy();
        board = null;
    }
    autoPlay = false;
    
    // Stop analysis when closing viewer
    if (analysisMode) {
        stopAnalysis();
    }
}

function initializeBoard() {
    const config = {
        position: 'start',
        draggable: true,
        onDrop: onPieceDrop,
        onDragStart: onDragStart,
        onMouseoverSquare: (square, piece) => {
            console.log('Mouse over square:', square, 'piece:', piece);
        },
        onMouseoutSquare: (square, piece) => {
            console.log('Mouse out square:', square, 'piece:', piece);
        },
        // Use local chess piece images
        pieceTheme: 'img/chesspieces/wikipedia/{piece}.png',
        moveSpeed: 200,
        snapbackSpeed: 100,
        snapSpeed: 100,
        appearSpeed: 200,
        trashSpeed: 100
    };
    
    if (board) {
        board.destroy();
    }
    
    board = Chessboard('board', config);
    game = new Chess();
}

function onDragStart(source, piece, position, orientation) {
    console.log('onDragStart called:', { source, piece, guessMode, turn: game.turn() });
    
    // Only allow dragging if guess mode is on
    if (!guessMode) {
        console.log('Drag blocked: guess mode is off');
        return false;
    }
    
    // Only allow dragging pieces of the side to move
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
        console.log('Drag blocked: wrong side to move');
        return false;
    }
    
    console.log('Drag allowed');
    return true;
}

function toggleGuessMode() {
    guessMode = !guessMode;
    const button = document.getElementById('toggleGuessMode');
    button.textContent = guessMode ? '🎯 Guess Mode: ON' : '🎯 Guess Mode: OFF';
    button.className = guessMode ? 'btn btn-primary' : 'btn btn-secondary';
    
    if (guessMode) {
        // Hide move feedback initially
        document.getElementById('moveFeedback').style.display = 'none';
        // Always hide analysis info in guess mode
        forceHideAnalysisInfo();
        // Start background analysis if needed
        if (!analysisMode) {
            startBackgroundAnalysis();
        }
    } else {
        // Hide feedback
        document.getElementById('moveFeedback').style.display = 'none';
        // Show analysis info when guess mode is off
        forceShowAnalysisInfo();
    }
}

function forceHideAnalysisInfo() {
    // Always hide analysis panel in guess mode
    const analysisInfo = document.getElementById('analysisInfo');
    if (analysisInfo) {
        analysisInfo.style.display = 'none';
    }
    
    // Also update the analysis button to show it's hidden
    const toggleBtn = document.getElementById('toggleAnalysis');
    if (toggleBtn && analysisMode) {
        toggleBtn.innerHTML = '🔍 Analysis (Hidden in Guess Mode)';
        toggleBtn.disabled = true;
    }
}

function forceShowAnalysisInfo() {
    // Show analysis panel when not in guess mode
    const analysisInfo = document.getElementById('analysisInfo');
    if (analysisInfo && analysisMode) {
        analysisInfo.style.display = 'block';
    }
    
    // Restore the analysis button
    const toggleBtn = document.getElementById('toggleAnalysis');
    if (toggleBtn) {
        toggleBtn.innerHTML = analysisMode ? '🔍 Stop Analysis' : '🔍 Start Analysis';
        toggleBtn.disabled = false;
    }
}

function startBackgroundAnalysis() {
    // Start analysis but keep UI hidden
    if (!analysisMode) {
        toggleAnalysis();
        // Immediately hide the UI after starting
        forceHideAnalysisInfo();
    }
}

function onPieceDrop(source, target, piece, newPos, oldPos, orientation) {
    console.log('onPieceDrop called:', { source, target, piece, guessMode });
    
    // Prevent the move if not in guess mode
    if (!guessMode) {
        console.log('Drop blocked: guess mode is off');
        return 'snapback';
    }
    
    // Test the move without permanently making it
    const moveObj = {
        from: source,
        to: target,
        promotion: 'q' // Always promote to queen for simplicity
    };
    
    // Create a temporary game to test the move
    const tempGame = new Chess(game.fen());
    const testMove = tempGame.move(moveObj);
    
    if (testMove === null) {
        return 'snapback';
    }
    
    // Evaluate the move
    evaluatePlayerMove(testMove);
    
    // Always snapback - we're just evaluating, not actually making the move
    return 'snapback';
}

function evaluatePlayerMove(playerMove) {
    console.log('\n=== EVALUATE PLAYER MOVE ===');
    console.log('playerMove:', playerMove);
    console.log('bestMoveAtPosition:', bestMoveAtPosition);
    console.log('evaluationAtPosition:', evaluationAtPosition);
    console.log('current turn:', game.turn());
    console.log('current position:', game.fen());
    
    if (!bestMoveAtPosition || evaluationAtPosition === null || evaluationAtPosition === undefined) {
        console.log('Missing analysis data, showing evaluating message');
        showMoveFeedback('⏳ Evaluating...', 'Please wait while the engine analyzes your move.', 'neutral');
        
        // Try multiple times with increasing delays, then give up
        let attempts = 0;
        const maxAttempts = 8;
        
        const retryEvaluation = () => {
            attempts++;
            if (bestMoveAtPosition && evaluationAtPosition) {
                evaluatePlayerMove(playerMove);
            } else if (attempts < maxAttempts) {
                setTimeout(retryEvaluation, 500 * attempts); // Increasing delay
            } else {
                // Give up and provide basic feedback
                showMoveFeedback(
                    '⚠️ Analysis Timeout', 
                    'Engine analysis took too long. Try making another move or restart analysis.', 
                    'neutral'
                );
            }
        };
        
        setTimeout(retryEvaluation, 500);
        return;
    }
    
    const playerMoveUci = playerMove.from + playerMove.to + (playerMove.promotion || '');
    const bestMoveUci = bestMoveAtPosition;
    
    console.log(`Comparing player move ${playerMoveUci} to best move ${bestMoveUci}`);
    console.log('Current evaluation at position:', evaluationAtPosition);
    
    // If player move matches best move
    if (playerMoveUci === bestMoveUci) {
        showMoveFeedback(
            '🎉 Excellent!', 
            'You found the best move!', 
            'excellent'
        );
        return;
    }
    
    // Evaluate the player's move by temporarily making it and getting evaluation
    console.log('Calling evaluateAlternativeMove for:', playerMoveUci);
    evaluateAlternativeMove(playerMoveUci, (playerEval) => {
        console.log('evaluateAlternativeMove callback received:', playerEval);
        if (playerEval === null) {
            showMoveFeedback(
                '❌ Illegal Move', 
                'This move is not legal in the current position.', 
                'poor'
            );
            return;
        }
        
        // Adjust evaluations to be from the current player's perspective
        let bestEval = evaluationAtPosition;
        let adjustedPlayerEval = playerEval;
        
        // If it's black to move, both evaluations should be negated for comparison
        if (game.turn() === 'b') {
            bestEval = -bestEval;
            adjustedPlayerEval = -adjustedPlayerEval;
        }
        
        const evalDiff = Math.abs(adjustedPlayerEval - bestEval);
        
        console.log(`Best eval: ${bestEval}, Player eval: ${adjustedPlayerEval}, Diff: ${evalDiff}`);
        
        if (evalDiff <= 0.1) {
            showMoveFeedback(
                '✅ Excellent!', 
                `Your move is just as good as the engine's choice! Best move was: ${formatMove(bestMoveUci)} (Eval: ${bestEval > 0 ? '+' : ''}${bestEval.toFixed(2)})`, 
                'excellent'
            );
        } else if (evalDiff <= 0.5) {
            showMoveFeedback(
                '👍 Good move!', 
                `Very close to optimal! Best: ${formatMove(bestMoveUci)} (${bestEval > 0 ? '+' : ''}${bestEval.toFixed(2)}), Your move: ${adjustedPlayerEval > 0 ? '+' : ''}${adjustedPlayerEval.toFixed(2)}`, 
                'good'
            );
        } else if (evalDiff <= 1.0) {
            showMoveFeedback(
                '👌 OK move', 
                `Decent, but there's better. Best: ${formatMove(bestMoveUci)} (${bestEval > 0 ? '+' : ''}${bestEval.toFixed(2)}), Your move: ${adjustedPlayerEval > 0 ? '+' : ''}${adjustedPlayerEval.toFixed(2)}`, 
                'ok'
            );
        } else {
            showMoveFeedback(
                '⚠️ Poor move', 
                `This loses advantage. Best: ${formatMove(bestMoveUci)} (${bestEval > 0 ? '+' : ''}${bestEval.toFixed(2)}), Your move: ${adjustedPlayerEval > 0 ? '+' : ''}${adjustedPlayerEval.toFixed(2)}`, 
                'poor'
            );
        }
    });
}

function evaluateAlternativeMove(moveUci, callback) {
    console.log('evaluateAlternativeMove called for move:', moveUci);
    if (!stockfish) {
        console.log('No stockfish available');
        callback(null);
        return;
    }
    
    // Create a temporary position after the player's move
    const tempGame = new Chess(game.fen());
    
    // Try to make the player's move
    const from = moveUci.substring(0, 2);
    const to = moveUci.substring(2, 4);
    const promotion = moveUci.length > 4 ? moveUci.substring(4, 5) : undefined;
    
    const move = tempGame.move({ from, to, promotion });
    if (!move) {
        callback(null);
        return;
    }
    
    // Quick analysis of this position
    const tempFen = tempGame.fen();
    stockfish.postMessage('stop');
    stockfish.postMessage(`position fen ${tempFen}`);
    stockfish.postMessage('go depth 15 movetime 2000');
    
    // Listen for evaluation (temporary listener)
    let tempEvaluation = null;
    const tempHandler = function(event) {
        const message = event.data || event;
        if (typeof message === 'string' && message.includes('score cp')) {
            const parts = message.split(' ');
            for (let i = 0; i < parts.length; i++) {
                if (parts[i] === 'score' && parts[i + 1] === 'cp') {
                    tempEvaluation = parseInt(parts[i + 2]) / 100;
                    // Don't adjust here - we'll do it in the comparison function
                    break;
                }
            }
        } else if (typeof message === 'string' && message.startsWith('bestmove')) {
            // Remove this temporary listener
            stockfish.onmessage = originalStockfishHandler;
            callback(tempEvaluation);
        }
    };
    
    // Store original handler and use temp one
    const originalStockfishHandler = stockfish.onmessage;
    stockfish.onmessage = tempHandler;
}

function showMoveFeedback(title, details, type) {
    const feedbackDiv = document.getElementById('moveFeedback');
    const messageDiv = document.getElementById('feedbackMessage');
    const detailsDiv = document.getElementById('feedbackDetails');
    
    messageDiv.textContent = title;
    messageDiv.className = `feedback-message ${type}`;
    detailsDiv.textContent = details;
    
    feedbackDiv.style.display = 'block';
    
    // Clear any existing timeout
    if (feedbackDiv.hideTimeout) {
        clearTimeout(feedbackDiv.hideTimeout);
    }
    
    // Auto-hide - shorter timeout for temporary messages
    const hideDelay = title.includes('Evaluating') || title.includes('Timeout') ? 3000 : 8000;
    feedbackDiv.hideTimeout = setTimeout(() => {
        feedbackDiv.style.display = 'none';
    }, hideDelay);
}

function loadGameMoves() {
    moveHistory = [];
    currentMoveIndex = -1;
    
    const moves = currentGame.moves
        .replace(/\{[^}]*\}/g, '')
        .replace(/\d+\./g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(move => move && !['1-0', '0-1', '1/2-1/2', '*'].includes(move));
    
    const tempGame = new Chess();
    moves.forEach(move => {
        try {
            const result = tempGame.move(move);
            if (result) {
                moveHistory.push({
                    san: result.san,
                    fen: tempGame.fen()
                });
            }
        } catch (e) {
            console.error('Invalid move:', move);
        }
    });
    
    displayMoveList();
    navigateMove(0);
}

function displayMoveList() {
    const moveListDiv = document.getElementById('moveList');
    let html = '';
    
    for (let i = 0; i < moveHistory.length; i++) {
        if (i % 2 === 0) {
            html += `${Math.floor(i/2) + 1}. `;
        }
        html += `<span class="move" onclick="navigateMove(${i})">${moveHistory[i].san}</span> `;
        if (i % 2 === 1) {
            html += '<br>';
        }
    }
    
    moveListDiv.innerHTML = html;
}

function navigateMove(index) {
    if (index < -1 || index >= moveHistory.length) {
        return;
    }
    
    currentMoveIndex = index;
    
    if (index === -1) {
        game.reset();
        board.position('start', true);
    } else {
        game.load(moveHistory[index].fen);
        board.position(game.fen(), true);
    }
    
    // Clear guess mode data when position changes
    if (guessMode) {
        bestMoveAtPosition = null;
        evaluationAtPosition = null;
        lastPosition = null;
        document.getElementById('moveFeedback').style.display = 'none';
        
        // Always hide analysis info in guess mode
        forceHideAnalysisInfo();
        
        // Restart analysis for the new position
        if (analysisMode) {
            stopAnalysis();
            setTimeout(() => startBackgroundAnalysis(), 100);
        }
    }
    
    updateMoveHighlight();
    updateCurrentMove();
    
    // Trigger analysis if analysis mode is active
    if (analysisMode) {
        // Clear previous arrows and analysis immediately
        clearBoardArrows();
        document.getElementById('bestMove').textContent = '-';
        document.getElementById('evaluation').textContent = '+0.00';
        document.querySelector('.analysis-status').textContent = 'Position changed...';
        
        setTimeout(() => analyzeCurrentPosition(), 200);
    }
}

function updateMoveHighlight() {
    document.querySelectorAll('.move').forEach((el, index) => {
        if (index === currentMoveIndex) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
}

function updateCurrentMove() {
    const currentMoveDiv = document.getElementById('currentMove');
    if (currentMoveIndex === -1) {
        currentMoveDiv.textContent = 'Start position';
    } else {
        const moveNum = Math.floor(currentMoveIndex / 2) + 1;
        const color = currentMoveIndex % 2 === 0 ? 'White' : 'Black';
        currentMoveDiv.textContent = `Move ${moveNum} - ${color}: ${moveHistory[currentMoveIndex].san}`;
    }
}

function toggleAutoPlay() {
    autoPlay = !autoPlay;
    const playBtn = document.getElementById('playBtn');
    playBtn.textContent = autoPlay ? '⏸' : '▶';
    
    if (autoPlay) {
        autoPlayMoves();
    }
}

function autoPlayMoves() {
    if (!autoPlay) {
        return;
    }
    
    if (currentMoveIndex < moveHistory.length - 1) {
        navigateMove(currentMoveIndex + 1);
        setTimeout(autoPlayMoves, 1200);
    } else {
        autoPlay = false;
        document.getElementById('playBtn').textContent = '▶';
    }
}

async function deleteGame(gameId) {
    if (!confirm('Are you sure you want to delete this game?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/games/${gameId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            loadStats();
            searchGames();
        }
    } catch (error) {
        console.error('Error deleting game:', error);
    }
}

function showMessage(elementOrMessage, messageOrType, type) {
    // Handle both calling patterns:
    // showMessage(element, message, type) - for import results
    // showMessage(message, type) - for position search messages
    
    if (arguments.length === 3) {
        // Old pattern: showMessage(element, message, type)
        const element = elementOrMessage;
        const message = messageOrType;
        element.textContent = message;
        element.className = `result-message ${type}`;
        element.style.display = 'block';
        
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    } else {
        // New pattern: showMessage(message, type) - show in position search result area
        const message = elementOrMessage;
        const messageType = messageOrType;
        const resultDiv = document.getElementById('positionSearchResult');
        if (resultDiv) {
            resultDiv.textContent = message;
            resultDiv.className = `result-message ${messageType}`;
            resultDiv.style.display = 'block';
            
            setTimeout(() => {
                resultDiv.style.display = 'none';
            }, 5000);
        } else {
            console.log(`${messageType.toUpperCase()}: ${message}`);
        }
    }
}

function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            
            button.classList.add('active');
            document.getElementById(`${targetTab}Tab`).classList.add('active');
        });
    });
    
    const searchTabButtons = document.querySelectorAll('.search-tab-btn');
    const searchTabPanes = document.querySelectorAll('.search-tab-pane');
    
    searchTabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.searchTab;
            
            searchTabButtons.forEach(btn => btn.classList.remove('active'));
            searchTabPanes.forEach(pane => pane.classList.remove('active'));
            
            button.classList.add('active');
            document.getElementById(`${targetTab}SearchTab`).classList.add('active');
        });
    });
}

function setupPositionSearch() {
    let positionBoard = null;
    let positionGame = new Chess();
    let multiPieceSquares = {}; // Track squares with multiple piece options
    let currentSelectedSquare = null;
    
    const boardConfig = {
        draggable: true,
        dropOffBoard: 'trash',
        sparePieces: true,
        pieceTheme: 'img/chesspieces/wikipedia/{piece}.png',
        onDragStart: function (source, piece, position, orientation) {
            return true;
        },
        onDrop: function (source, target, piece, newPos, oldPos, orientation) {
            // Check if this is a multi-piece square
            if (multiPieceSquares[target]) {
                // If it's already a multi-piece square, open the selection modal
                openPieceSelectionModal(target);
                return 'snapback'; // Don't place the piece
            }
            updateFEN();
        },
        onSnapEnd: function () {
            updateFEN();
        }
    };
    
    positionBoard = Chessboard('positionBoard', boardConfig);
    
    // Add right-click event to squares for multi-piece selection
    setTimeout(() => {
        const squares = document.querySelectorAll('#positionBoard .square-55d63');
        squares.forEach(square => {
            square.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const squareEl = e.target.closest('.square-55d63');
                if (squareEl) {
                    const square = squareEl.getAttribute('data-square');
                    if (square) {
                        openPieceSelectionModal(square);
                    }
                }
            });
        });
    }, 500);
    
    function openPieceSelectionModal(square) {
        currentSelectedSquare = square;
        document.getElementById('selectedSquare').textContent = square.toUpperCase();
        
        // Clear all checkboxes first
        const checkboxes = document.querySelectorAll('#pieceSelectionModal input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
        
        // If this square already has multiple pieces selected, check them
        if (multiPieceSquares[square]) {
            multiPieceSquares[square].forEach(piece => {
                const checkbox = document.querySelector(`#pieceSelectionModal input[value="${piece}"]`);
                if (checkbox) checkbox.checked = true;
            });
        } else {
            // If there's a current piece on the square, check it
            const currentPiece = positionBoard.position()[square];
            if (currentPiece) {
                const checkbox = document.querySelector(`#pieceSelectionModal input[value="${currentPiece}"]`);
                if (checkbox) checkbox.checked = true;
            }
        }
        
        document.getElementById('pieceSelectionModal').style.display = 'block';
    }
    
    function closePieceSelectionModal() {
        document.getElementById('pieceSelectionModal').style.display = 'none';
        currentSelectedSquare = null;
    }
    
    function applyPieceSelection() {
        if (!currentSelectedSquare) return;
        
        const selectedPieces = [];
        const checkboxes = document.querySelectorAll('#pieceSelectionModal input[type="checkbox"]:checked');
        checkboxes.forEach(cb => selectedPieces.push(cb.value));
        
        if (selectedPieces.length === 0) {
            // Clear the square
            delete multiPieceSquares[currentSelectedSquare];
            positionBoard.removePiece(currentSelectedSquare);
            removeMultiPieceIndicator(currentSelectedSquare);
        } else if (selectedPieces.length === 1) {
            // Single piece - place it normally
            delete multiPieceSquares[currentSelectedSquare];
            positionBoard.position(currentSelectedSquare, selectedPieces[0]);
            removeMultiPieceIndicator(currentSelectedSquare);
        } else {
            // Multiple pieces - store as multi-piece square
            multiPieceSquares[currentSelectedSquare] = selectedPieces;
            // Place the first piece visually, but mark as multi-piece
            positionBoard.position(currentSelectedSquare, selectedPieces[0]);
            addMultiPieceIndicator(currentSelectedSquare);
        }
        
        updateFEN();
        closePieceSelectionModal();
    }
    
    function addMultiPieceIndicator(square) {
        setTimeout(() => {
            const squareEl = document.querySelector(`#positionBoard .square-${square}`);
            if (squareEl) {
                squareEl.classList.add('multi-piece-square');
            }
        }, 100);
    }
    
    function removeMultiPieceIndicator(square) {
        const squareEl = document.querySelector(`#positionBoard .square-${square}`);
        if (squareEl) {
            squareEl.classList.remove('multi-piece-square');
        }
    }
    
    function updateFEN() {
        // Generate a special FEN that includes multi-piece information
        const position = positionBoard.position();
        let fenWithMultiPieces = '';
        
        // Debug: log the position object to see what format it's in
        console.log('Position object:', position);
        
        // Convert position to FEN, but handle multi-piece squares
        for (let rank = 8; rank >= 1; rank--) {
            let rankString = '';
            let emptyCount = 0;
            
            for (let fileNum = 1; fileNum <= 8; fileNum++) {
                const file = String.fromCharCode(96 + fileNum); // a, b, c, etc.
                const square = file + rank;
                
                if (multiPieceSquares[square]) {
                    // Multi-piece square - encode as special notation
                    if (emptyCount > 0) {
                        rankString += emptyCount;
                        emptyCount = 0;
                    }
                    rankString += `[${multiPieceSquares[square].join('|')}]`;
                } else if (position[square]) {
                    // Chessboard.js returns pieces as 'wP', 'bN', etc.
                    // We need to extract just the piece character
                    const pieceData = position[square];
                    let piece;
                    
                    if (pieceData.length === 2 && /^[wb][PNBRQK]$/i.test(pieceData)) {
                        // Format: color + piece (e.g., 'wP', 'bN')
                        const color = pieceData[0];
                        const pieceType = pieceData[1];
                        // Convert to standard FEN notation (uppercase = white, lowercase = black)
                        piece = color === 'w' ? pieceType.toUpperCase() : pieceType.toLowerCase();
                    } else if (/^[pnbrqkPNBRQK]$/.test(pieceData)) {
                        // Already in correct format
                        piece = pieceData;
                    } else {
                        // Invalid format
                        console.warn(`Invalid piece format '${pieceData}' at square ${square}, treating as empty`);
                        emptyCount++;
                        continue;
                    }
                    
                    // Add the piece to the FEN
                    if (emptyCount > 0) {
                        rankString += emptyCount;
                        emptyCount = 0;
                    }
                    rankString += piece;
                } else {
                    emptyCount++;
                }
            }
            
            if (emptyCount > 0) {
                rankString += emptyCount;
            }
            
            if (rank > 1) rankString += '/';
            fenWithMultiPieces += rankString;
        }
        
        // For display, show regular FEN
        const regularFen = positionBoard.fen() + ' w - - 0 1';
        document.getElementById('fenInput').value = regularFen;
        
        // Store the multi-piece FEN for search
        positionBoard._multiPieceFen = fenWithMultiPieces + ' w - - 0 1';
    }
    
    // Modal event listeners
    document.getElementById('closePieceSelection').addEventListener('click', closePieceSelectionModal);
    document.getElementById('applyPieceSelection').addEventListener('click', applyPieceSelection);
    document.getElementById('clearSquare').addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('#pieceSelectionModal input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = false);
    });
    
    // Close modal when clicking outside
    document.getElementById('pieceSelectionModal').addEventListener('click', (e) => {
        if (e.target.id === 'pieceSelectionModal') {
            closePieceSelectionModal();
        }
    });
    
    document.getElementById('clearBoard').addEventListener('click', () => {
        positionBoard.clear();
        multiPieceSquares = {};
        // Remove all multi-piece indicators
        document.querySelectorAll('.multi-piece-square').forEach(el => {
            el.classList.remove('multi-piece-square');
        });
        updateFEN();
    });
    
    document.getElementById('startPosition').addEventListener('click', () => {
        positionBoard.start();
        positionGame.reset();
        multiPieceSquares = {};
        // Remove all multi-piece indicators
        document.querySelectorAll('.multi-piece-square').forEach(el => {
            el.classList.remove('multi-piece-square');
        });
        document.getElementById('fenInput').value = positionGame.fen();
    });
    
    document.getElementById('flipBoard').addEventListener('click', () => {
        positionBoard.flip();
    });
    
    let currentSearchController = null;
    
    document.getElementById('positionSearchForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        let fen = document.getElementById('fenInput').value;
        const searchType = document.getElementById('searchType').value;
        
        // For pattern search with multi-pieces, use the special FEN
        if (searchType === 'pattern' && positionBoard._multiPieceFen) {
            fen = positionBoard._multiPieceFen;
        }
        
        // Debug logging
        console.log('Pattern search debug:');
        console.log('  Original FEN:', document.getElementById('fenInput').value);
        console.log('  Multi-piece FEN:', positionBoard._multiPieceFen);
        console.log('  Using FEN:', fen);
        console.log('  Search type:', searchType);
        
        // Check for valid FEN - allow pattern searches with sparse positions
        if (!fen || fen.trim() === '' || fen === ' w - - 0 1' || fen === '8/8/8/8/8/8/8/8 w - - 0 1') {
            showMessage('Please set up a position on the board', 'error');
            return;
        }
        
        // For pattern search, ensure we have at least one piece
        if (searchType === 'pattern') {
            const boardPart = fen.split(' ')[0];
            const hasPieces = /[a-zA-Z]/.test(boardPart);
            console.log('  Board part:', boardPart);
            console.log('  Has pieces test:', hasPieces);
            console.log('  Board part characters:', Array.from(boardPart).map(c => `${c}(${c.charCodeAt(0)})`));
            if (!hasPieces) {
                showMessage('Please place at least one piece on the board for pattern search', 'error');
                return;
            }
        }
        
        // Show progress UI
        showPositionSearchProgress();
        
        try {
            if (searchType === 'pattern') {
                // Use streaming API for pattern search
                await performStreamingSearch(fen, searchType);
            } else {
                // Use regular API for other searches
                await performRegularSearch(fen, searchType);
            }
        } catch (error) {
            showMessage('Error searching positions: ' + error.message, 'error');
            hidePositionSearchProgress();
        }
    });
    
    document.getElementById('cancelPositionSearch').addEventListener('click', () => {
        if (currentSearchController) {
            currentSearchController.abort();
            currentSearchController = null;
        }
        hidePositionSearchProgress();
        showMessage('Search cancelled', 'info');
    });
    
    async function performStreamingSearch(fen, searchType) {
        currentSearchController = new AbortController();
        
        try {
            const response = await fetch('/api/positions/search/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fen: fen,
                    searchType: searchType,
                    page: currentPage,
                    pageSize: currentPageSize
                }),
                signal: currentSearchController.signal
            });
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (let line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            
                            if (data.type === 'progress') {
                                updatePositionSearchProgress(data.progress, data.message, data.found || 0);
                            } else if (data.type === 'complete') {
                                if (data.success) {
                                    displayGames(data.games);
                                    updatePagination(data.pagination);
                                    showMessage(`Found ${data.pagination.totalGames} games with this pattern`, 'success');
                                } else {
                                    showMessage(data.error || 'Search failed', 'error');
                                }
                                hidePositionSearchProgress();
                                break;
                            } else if (data.type === 'error') {
                                showMessage(data.error || 'Search failed', 'error');
                                hidePositionSearchProgress();
                                break;
                            }
                        } catch (e) {
                            // Ignore parsing errors for partial chunks
                        }
                    }
                }
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                showMessage('Error during streaming search: ' + error.message, 'error');
            }
            hidePositionSearchProgress();
        }
        
        currentSearchController = null;
    }
    
    async function performRegularSearch(fen, searchType) {
        updatePositionSearchProgress(50, 'Searching database...');
        
        const response = await fetch('/api/positions/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fen: fen,
                searchType: searchType,
                page: currentPage,
                pageSize: currentPageSize
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayGames(data.games);
            updatePagination(data.pagination);
            showMessage(`Found ${data.pagination.totalGames} games with this position`, 'success');
        } else {
            showMessage(data.error || 'Position search failed', 'error');
        }
        
        hidePositionSearchProgress();
    }
    
    function showPositionSearchProgress() {
        document.getElementById('positionSearchBtn').disabled = true;
        document.getElementById('positionSearchProgress').style.display = 'block';
        updatePositionSearchProgress(0, 'Starting search...');
    }
    
    function hidePositionSearchProgress() {
        document.getElementById('positionSearchBtn').disabled = false;
        document.getElementById('positionSearchProgress').style.display = 'none';
    }
    
    function updatePositionSearchProgress(percent, message, found = 0) {
        const fill = document.getElementById('positionSearchProgressFill');
        const text = document.getElementById('positionSearchProgressText');
        
        fill.style.width = percent + '%';
        text.textContent = found > 0 ? `${message} (${found} matches found)` : message;
    }
    
    positionBoard.start();
    positionGame.reset();
    document.getElementById('fenInput').value = positionGame.fen();
}

function setupSettings() {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettings = document.getElementById('closeSettings');
    
    settingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'block';
        loadDetailedStats();
    });
    
    closeSettings.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });
    
    // Close modal when clicking outside
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });
    
    // Set up index management buttons
    document.getElementById('rebuildIndex').addEventListener('click', rebuildIndex);
    document.getElementById('clearIndex').addEventListener('click', clearIndex);
    document.getElementById('fixIndex').addEventListener('click', fixIndex);
    document.getElementById('optimizeDb').addEventListener('click', optimizeDatabase);
}

async function loadDetailedStats() {
    try {
        const response = await fetch('/api/stats/detailed');
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('statTotalGames').textContent = data.totalGames.toLocaleString();
            document.getElementById('statTotalPositions').textContent = data.totalPositions.toLocaleString();
            document.getElementById('statUniquePositions').textContent = data.uniquePositions.toLocaleString();
            document.getElementById('statDbSize').textContent = data.dbSize;
            document.getElementById('statIndexCoverage').textContent = data.indexCoverage;
            document.getElementById('statLastIndexUpdate').textContent = data.lastIndexUpdate;
        }
    } catch (error) {
        showMessage('Error loading detailed stats: ' + error.message, 'error');
    }
}

async function rebuildIndex() {
    if (!confirm('Are you sure you want to rebuild the entire position index? This may take several minutes and will delete all existing position data.')) {
        return;
    }
    
    const button = document.getElementById('rebuildIndex');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '🔄 Rebuilding...';
    
    showProgress('Rebuilding position index...', 0);
    
    try {
        const response = await fetch('/api/index/rebuild', {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showMessage(`Index rebuild started for ${data.total} games`, 'success');
            // Refresh stats after a delay
            setTimeout(() => {
                loadDetailedStats();
                hideProgress();
            }, 5000);
        } else {
            showMessage(data.error || 'Failed to rebuild index', 'error');
        }
    } catch (error) {
        showMessage('Error rebuilding index: ' + error.message, 'error');
    } finally {
        button.disabled = false;
        button.textContent = originalText;
        hideProgress();
    }
}

async function clearIndex() {
    if (!confirm('Are you sure you want to clear the position index? This will remove all position search capability until you rebuild the index.')) {
        return;
    }
    
    const button = document.getElementById('clearIndex');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '🗑️ Clearing...';
    
    try {
        const response = await fetch('/api/index/clear', {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showMessage(`Position index cleared (${data.deleted} records deleted)`, 'success');
            loadDetailedStats();
        } else {
            showMessage(data.error || 'Failed to clear index', 'error');
        }
    } catch (error) {
        showMessage('Error clearing index: ' + error.message, 'error');
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

async function fixIndex() {
    const button = document.getElementById('fixIndex');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '🔧 Fixing...';
    
    try {
        const response = await fetch('/api/index/fix', {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showMessage(data.message, 'success');
            loadDetailedStats();
        } else {
            showMessage(data.error || 'Failed to fix index', 'error');
        }
    } catch (error) {
        showMessage('Error fixing index: ' + error.message, 'error');
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

async function optimizeDatabase() {
    const button = document.getElementById('optimizeDb');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '⚡ Optimizing...';
    
    try {
        const response = await fetch('/api/index/optimize', {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showMessage(data.message, 'success');
            loadDetailedStats();
        } else {
            showMessage(data.error || 'Failed to optimize database', 'error');
        }
    } catch (error) {
        showMessage('Error optimizing database: ' + error.message, 'error');
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

function showProgress(text, percent) {
    const container = document.getElementById('indexProgress');
    const fill = document.getElementById('indexProgressFill');
    const textElement = document.getElementById('indexProgressText');
    
    container.style.display = 'block';
    fill.style.width = percent + '%';
    textElement.textContent = text;
}

function hideProgress() {
    document.getElementById('indexProgress').style.display = 'none';
}

function setupFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const uploadPrompt = document.getElementById('uploadPrompt');
    const fileSelected = document.getElementById('fileSelected');
    const fileName = document.getElementById('fileName');
    const clearFile = document.getElementById('clearFile');
    const uploadBtn = document.getElementById('uploadBtn');
    
    uploadPrompt.addEventListener('click', () => {
        fileInput.click();
    });
    
    uploadPrompt.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadPrompt.classList.add('drag-over');
    });
    
    uploadPrompt.addEventListener('dragleave', () => {
        uploadPrompt.classList.remove('drag-over');
    });
    
    uploadPrompt.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadPrompt.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const fileName = files[0].name.toLowerCase();
            if (fileName.endsWith('.pgn') || fileName.endsWith('.zip')) {
                handleFileSelect(files[0]);
            } else {
                showMessage(document.getElementById('importResult'), 'Please select a valid PGN or ZIP file', 'error');
            }
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });
    
    clearFile.addEventListener('click', () => {
        fileInput.value = '';
        uploadPrompt.style.display = 'block';
        fileSelected.style.display = 'none';
        uploadBtn.disabled = true;
    });
    
    function handleFileSelect(file) {
        if (file.size > 100 * 1024 * 1024) {
            showMessage(document.getElementById('importResult'), 'File size exceeds 100MB limit', 'error');
            return;
        }
        
        fileName.textContent = `${file.name} (${formatFileSize(file.size)})`;
        uploadPrompt.style.display = 'none';
        fileSelected.style.display = 'flex';
        uploadBtn.disabled = false;
    }
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function uploadPGN() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    const resultDiv = document.getElementById('importResult');
    const progressBar = document.getElementById('importProgress');
    const progressFill = progressBar.querySelector('.progress-fill');
    const progressText = progressBar.querySelector('.progress-text');
    
    if (!file) {
        showMessage(resultDiv, 'Please select a file', 'error');
        return;
    }
    
    progressBar.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = 'Uploading file...';
    
    try {
        const formData = new FormData();
        formData.append('file', file);
        
        progressFill.style.width = '30%';
        progressText.textContent = 'Processing file...';
        
        const response = await fetch('/api/games/upload', {
            method: 'POST',
            body: formData
        });
        
        progressFill.style.width = '100%';
        progressText.textContent = 'Complete!';
        
        const data = await response.json();
        
        if (data.success) {
            showMessage(resultDiv, `Successfully imported ${data.imported} of ${data.total} games from ${file.name}`, 'success');
            
            fileInput.value = '';
            document.getElementById('uploadPrompt').style.display = 'block';
            document.getElementById('fileSelected').style.display = 'none';
            document.getElementById('uploadBtn').disabled = true;
            
            loadStats();
            searchGames();
        } else {
            showMessage(resultDiv, `Error: ${data.error}`, 'error');
        }
    } catch (error) {
        showMessage(resultDiv, `Error uploading file: ${error.message}`, 'error');
    } finally {
        setTimeout(() => {
            progressBar.style.display = 'none';
        }, 2000);
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

function setupPagination() {
    document.getElementById('pageSize').addEventListener('change', (e) => {
        currentPageSize = parseInt(e.target.value);
        searchGames(1); // Reset to first page when changing page size
    });
    
    // Setup both top and bottom pagination controls
    const positions = ['Top', 'Bottom'];
    positions.forEach(pos => {
        document.getElementById(`firstPage${pos}`).addEventListener('click', () => {
            if (currentPage > 1) {
                searchGames(1);
            }
        });
        
        document.getElementById(`prevPage${pos}`).addEventListener('click', () => {
            if (currentPage > 1) {
                searchGames(currentPage - 1);
            }
        });
        
        document.getElementById(`nextPage${pos}`).addEventListener('click', () => {
            searchGames(currentPage + 1);
        });
        
        document.getElementById(`lastPage${pos}`).addEventListener('click', () => {
            const totalPages = parseInt(document.getElementById(`lastPage${pos}`).dataset.totalPages);
            if (currentPage < totalPages) {
                searchGames(totalPages);
            }
        });
    });
}

function updatePagination(pagination) {
    const { page, pageSize, totalGames, totalPages, hasNext, hasPrev } = pagination;
    
    // Update pagination info for both top and bottom
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, totalGames);
    const infoText = `Showing ${start}-${end} of ${totalGames} games`;
    
    document.getElementById('paginationInfoTop').textContent = infoText;
    document.getElementById('paginationInfoBottom').textContent = infoText;
    
    // Update button states for both top and bottom
    const positions = ['Top', 'Bottom'];
    positions.forEach(pos => {
        document.getElementById(`firstPage${pos}`).disabled = !hasPrev;
        document.getElementById(`prevPage${pos}`).disabled = !hasPrev;
        document.getElementById(`nextPage${pos}`).disabled = !hasNext;
        document.getElementById(`lastPage${pos}`).disabled = !hasNext;
        document.getElementById(`lastPage${pos}`).dataset.totalPages = totalPages;
    });
    
    // Generate page numbers for both top and bottom
    generatePageNumbers(page, totalPages, 'Top');
    generatePageNumbers(page, totalPages, 'Bottom');
}

function generatePageNumbers(currentPage, totalPages, position = '') {
    const pageNumbersContainer = document.getElementById(`pageNumbers${position}`);
    pageNumbersContainer.innerHTML = '';
    
    if (totalPages <= 1) return;
    
    const maxVisible = 7; // Maximum number of page buttons to show
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    
    // Adjust start page if we're near the end
    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }
    
    // Show first page and ellipsis if needed
    if (startPage > 1) {
        addPageButton(1, currentPage, position, false);
        if (startPage > 2) {
            addPageButton('...', currentPage, position, true);
        }
    }
    
    // Show page range
    for (let i = startPage; i <= endPage; i++) {
        addPageButton(i, currentPage, position, false);
    }
    
    // Show ellipsis and last page if needed
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            addPageButton('...', currentPage, position, true);
        }
        addPageButton(totalPages, currentPage, position, false);
    }
}

function addPageButton(pageNum, currentPage, position = '', isDots = false) {
    const pageNumbersContainer = document.getElementById(`pageNumbers${position}`);
    const button = document.createElement('span');
    button.className = `page-number ${isDots ? 'dots' : ''} ${pageNum === currentPage ? 'active' : ''}`;
    button.textContent = pageNum;
    
    if (!isDots && pageNum !== currentPage) {
        button.addEventListener('click', () => {
            searchGames(pageNum);
        });
    }
    
    pageNumbersContainer.appendChild(button);
}

function setupStockfish() {
    document.getElementById('toggleAnalysis').addEventListener('click', toggleAnalysis);
}

function toggleAnalysis() {
    const toggleBtn = document.getElementById('toggleAnalysis');
    const analysisInfo = document.getElementById('analysisInfo');
    
    if (!analysisMode) {
        // Start analysis
        analysisMode = true;
        toggleBtn.textContent = '🛑 Stop Analysis';
        toggleBtn.classList.remove('btn-secondary');
        toggleBtn.classList.add('btn-danger');
        
        // Only show analysis info if not in guess mode
        if (!guessMode) {
            analysisInfo.style.display = 'block';
        }
        
        initializeStockfish();
        analyzeCurrentPosition();
    } else {
        // Stop analysis
        stopAnalysis();
    }
}

function stopAnalysis() {
    analysisMode = false;
    const toggleBtn = document.getElementById('toggleAnalysis');
    const analysisInfo = document.getElementById('analysisInfo');
    
    toggleBtn.textContent = '🔍 Start Analysis';
    toggleBtn.classList.remove('btn-danger');
    toggleBtn.classList.add('btn-secondary');
    analysisInfo.style.display = 'none';
    
    if (stockfish) {
        stockfish.postMessage('stop');
    }
    
    clearBoardArrows();
}

function initializeStockfish() {
    if (stockfish) {
        stockfish.terminate();
    }
    
    try {
        // Use local Stockfish worker directly
        stockfish = new Worker('./stockfish-nnue-16.js');
        
        stockfish.onmessage = function(event) {
            const message = event.data;
            console.log('Stockfish message:', message); // Debug logging
            
            if (message.includes('uciok')) {
                console.log('Stockfish UCI initialized');
                // Configure Stockfish options
                stockfish.postMessage('setoption name Threads value 1');
                stockfish.postMessage('setoption name Hash value 64');
                stockfish.postMessage('setoption name Minimum Thinking Time value 1000');
                stockfish.postMessage('ucinewgame');
                stockfish.postMessage('isready');
            } else if (message.includes('readyok')) {
                console.log('Stockfish is ready');
                document.querySelector('.analysis-status').textContent = 'Ready';
            } else if (message.includes('bestmove')) {
                const parts = message.split(' ');
                const bestMoveIndex = parts.indexOf('bestmove');
                if (bestMoveIndex !== -1 && bestMoveIndex + 1 < parts.length) {
                    const bestMove = parts[bestMoveIndex + 1];
                    if (bestMove !== '(none)' && bestMove.length >= 4) {
                        console.log('Best move found:', bestMove);
                        currentBestMove = bestMove;
                        
                        // Store for guess mode
                        if (guessMode) {
                            bestMoveAtPosition = bestMove;
                            lastPosition = game.fen();
                        }
                        
                        updateBestMoveDisplay(bestMove);
                        showBoardArrow(bestMove);
                        document.querySelector('.analysis-status').textContent = 'Analysis complete';
                    }
                }
            } else if (message.includes('info') && (message.includes('depth') || message.includes('score'))) {
                parseAnalysisInfo(message);
                // Update status with current depth
                const depthMatch = message.match(/depth (\d+)/);
                if (depthMatch) {
                    document.querySelector('.analysis-status').textContent = `Analyzing depth ${depthMatch[1]}...`;
                }
            }
        };
        
        stockfish.onerror = function(error) {
            console.error('Stockfish worker error:', error);
            document.querySelector('.analysis-status').textContent = 'Analysis failed';
        };
        
        // Initialize Stockfish
        stockfish.postMessage('uci');
        
    } catch (error) {
        console.error('Failed to initialize Stockfish:', error);
        document.querySelector('.analysis-status').textContent = 'Analysis unavailable';
    }
}

function useMockAnalysis() {
    console.log('Using mock analysis');
    // Simple mock analysis for demonstration
    setTimeout(() => {
        document.getElementById('analysisDepth').textContent = '10';
        document.getElementById('bestMove').textContent = 'e2-e4';
        document.getElementById('evaluation').textContent = '+0.25';
        document.getElementById('principalVariation').textContent = '1.e4 e5 2.Nf3 Nc6';
        
        // Show a mock arrow from e2 to e4
        if (game && currentMoveIndex === -1) {
            showBoardArrow('e2e4');
        }
    }, 1000);
}

function analyzeCurrentPosition() {
    if (!stockfish || !game || !analysisMode) return;
    
    clearBoardArrows();
    document.getElementById('analysisDepth').textContent = '0';
    document.getElementById('bestMove').textContent = '-';
    document.getElementById('evaluation').textContent = '+0.00';
    document.getElementById('principalVariation').textContent = '-';
    document.querySelector('.analysis-status').textContent = 'Starting analysis...';
    
    const fen = game.fen();
    console.log('Analyzing position:', fen);
    
    // Stop any ongoing analysis first
    stockfish.postMessage('stop');
    
    // Start new analysis
    setTimeout(() => {
        stockfish.postMessage(`position fen ${fen}`);
        stockfish.postMessage('go depth 33 movetime 10000'); // 33 depth, max 10 seconds
    }, 100);
}

function parseAnalysisInfo(message) {
    console.log('Raw Stockfish message:', message); // Debug: show full message
    const parts = message.split(' ');
    let depth = 0;
    let score = null;
    let pv = [];
    
    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === 'depth') {
            depth = parseInt(parts[i + 1]);
        } else if (parts[i] === 'score') {
            if (parts[i + 1] === 'cp') {
                score = parseInt(parts[i + 2]) / 100;
            } else if (parts[i + 1] === 'mate') {
                const mateIn = parseInt(parts[i + 2]);
                score = mateIn > 0 ? `+M${mateIn}` : `-M${Math.abs(mateIn)}`;
            }
        } else if (parts[i] === 'pv') {
            pv = parts.slice(i + 1);
            console.log('Found PV in message:', pv); // Debug logging
            break;
        }
    }
    
    if (depth > 0) {
        document.getElementById('analysisDepth').textContent = depth.toString();
        
        if (score !== null) {
            updateEvaluationDisplay(score);
            
            // Store evaluation for guess mode
            if (guessMode && typeof score === 'number') {
                evaluationAtPosition = score;
                console.log('Stored evaluation for guess mode:', evaluationAtPosition);
            }
        }
        
        if (pv.length > 0) {
            console.log('PV found with length:', pv.length, 'moves:', pv); // Debug
            updatePrincipalVariation(pv);
            // Update best move in real-time from the first move in principal variation
            if (pv[0]) {
                currentBestMove = pv[0];
                updateBestMoveDisplay(pv[0]);
                
                // Store for guess mode
                if (guessMode) {
                    bestMoveAtPosition = pv[0];
                    lastPosition = game.fen();
                    console.log('Stored best move for guess mode:', bestMoveAtPosition, 'at position:', lastPosition);
                }
            }
        } else {
            console.log('No PV in this message, pv.length:', pv.length); // Debug
        }
    }
}

function updateBestMoveDisplay(bestMove) {
    document.getElementById('bestMove').textContent = formatMove(bestMove);
}

function updateEvaluationDisplay(score) {
    const evalElement = document.getElementById('evaluation');
    
    if (typeof score === 'string') {
        // Mate score
        evalElement.textContent = score;
        evalElement.className = 'evaluation ' + (score.startsWith('+') ? 'positive' : 'negative');
    } else {
        // Centipawn score
        const displayScore = (game.turn() === 'b' ? -score : score).toFixed(2);
        evalElement.textContent = displayScore > 0 ? `+${displayScore}` : displayScore.toString();
        
        if (Math.abs(displayScore) < 0.1) {
            evalElement.className = 'evaluation neutral';
        } else {
            evalElement.className = 'evaluation ' + (displayScore > 0 ? 'positive' : 'negative');
        }
    }
}

function updatePrincipalVariation(pv) {
    console.log('Updating PV with:', pv); // Debug logging
    
    if (!pv || pv.length === 0) {
        document.getElementById('principalVariation').textContent = '-';
        return;
    }
    
    const tempGame = new Chess(game.fen());
    const formattedMoves = [];
    const startingMoveNumber = Math.ceil(tempGame.history().length / 2) + 1;
    let currentMoveNumber = startingMoveNumber;
    let isWhiteToMove = tempGame.turn() === 'w';
    
    for (let i = 0; i < Math.min(pv.length, 8); i++) {
        try {
            console.log(`Trying to parse move ${i}: ${pv[i]} in position ${tempGame.fen()}`); // Debug
            
            // Convert UCI format to Chess.js format
            const uciMove = pv[i];
            let move = null;
            
            if (uciMove && uciMove.length >= 4) {
                const from = uciMove.substring(0, 2);
                const to = uciMove.substring(2, 4);
                const promotion = uciMove.length > 4 ? uciMove.substring(4, 5) : undefined;
                
                // Try to make the move using from/to format
                move = tempGame.move({
                    from: from,
                    to: to,
                    promotion: promotion
                });
            }
            
            console.log('Move parsed successfully:', move); // Debug
            
            if (move) {
                if (isWhiteToMove) {
                    formattedMoves.push(`${currentMoveNumber}.${move.san}`);
                } else {
                    // For black moves, only show move number if it's the first move
                    if (i === 0 && !isWhiteToMove) {
                        formattedMoves.push(`${currentMoveNumber}...${move.san}`);
                    } else {
                        formattedMoves.push(move.san);
                    }
                    currentMoveNumber++;
                }
                isWhiteToMove = !isWhiteToMove;
                console.log('Formatted moves so far:', formattedMoves); // Debug
                console.log('New position after move:', tempGame.fen()); // Debug
            } else {
                console.log('Move was null/undefined - breaking'); // Debug
                break; // Stop if we can't parse a move
            }
        } catch (e) {
            console.log('Error parsing move:', pv[i], 'Error:', e); // Debug logging
            break;
        }
    }
    
    const result = formattedMoves.join(' ');
    console.log('Formatted PV:', result); // Debug logging
    
    const pvElement = document.getElementById('principalVariation');
    console.log('PV Element found:', !!pvElement); // Debug logging
    console.log('Setting PV text to:', result || '-'); // Debug logging
    
    if (pvElement) {
        // Try both textContent and innerHTML
        pvElement.textContent = result || '-';
        pvElement.innerHTML = result || '-';
        
        // Force a style update to make sure it displays
        pvElement.style.display = 'block';
        pvElement.style.visibility = 'visible';
        pvElement.style.color = '#495057';
        pvElement.style.fontSize = '13px';
        
        console.log('PV Element content after update:', pvElement.textContent); // Debug logging
        console.log('PV Element innerHTML after update:', pvElement.innerHTML); // Debug logging
        console.log('PV Element computed style display:', window.getComputedStyle(pvElement).display); // Debug logging
        console.log('PV Element computed style visibility:', window.getComputedStyle(pvElement).visibility); // Debug logging
    } else {
        console.error('principalVariation element not found!');
    }
}

function formatMove(uciMove) {
    if (!game || !uciMove || uciMove.length < 4) return uciMove;
    
    try {
        const tempGame = new Chess(game.fen());
        const from = uciMove.substring(0, 2);
        const to = uciMove.substring(2, 4);
        const promotion = uciMove.length > 4 ? uciMove.substring(4, 5) : undefined;
        
        const move = tempGame.move({
            from: from,
            to: to,
            promotion: promotion
        });
        
        return move ? move.san : uciMove;
    } catch (e) {
        return uciMove;
    }
}

function showBoardArrow(uciMove) {
    if (!uciMove || uciMove.length < 4) return;
    
    const fromSquare = uciMove.substring(0, 2);
    const toSquare = uciMove.substring(2, 4);
    
    clearBoardArrows();
    drawArrow(fromSquare, toSquare);
}

function drawArrow(fromSquare, toSquare) {
    const boardElement = document.querySelector('#board');
    if (!boardElement) return;
    
    const boardRect = boardElement.getBoundingClientRect();
    const squareSize = boardRect.width / 8;
    
    const fromCoords = getSquareCoordinates(fromSquare, squareSize, board.orientation());
    const toCoords = getSquareCoordinates(toSquare, squareSize, board.orientation());
    
    const arrowElement = document.createElement('div');
    arrowElement.className = 'board-arrow';
    arrowElement.innerHTML = createArrowSVG(fromCoords, toCoords, squareSize);
    
    boardElement.appendChild(arrowElement);
}

function getSquareCoordinates(square, squareSize, orientation) {
    const file = square.charCodeAt(0) - 97; // a=0, b=1, etc.
    const rank = parseInt(square.charAt(1)) - 1; // 1=0, 2=1, etc.
    
    let x, y;
    if (orientation === 'white') {
        x = file * squareSize + squareSize / 2;
        y = (7 - rank) * squareSize + squareSize / 2;
    } else {
        x = (7 - file) * squareSize + squareSize / 2;
        y = rank * squareSize + squareSize / 2;
    }
    
    return { x, y };
}

function createArrowSVG(from, to, squareSize) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);
    
    // Shorten the arrow to not overlap with pieces
    const shortenBy = squareSize * 0.3;
    const newLength = Math.max(length - shortenBy, squareSize * 0.2);
    const ratio = newLength / length;
    
    const newTo = {
        x: from.x + dx * ratio,
        y: from.y + dy * ratio
    };
    
    const arrowHeadSize = squareSize * 0.15;
    
    return `
        <svg style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;">
            <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                        refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" class="arrow-head" />
                </marker>
            </defs>
            <line x1="${from.x}" y1="${from.y}" x2="${newTo.x}" y2="${newTo.y}" 
                  class="arrow-line" marker-end="url(#arrowhead)" />
        </svg>
    `;
}

function clearBoardArrows() {
    const arrows = document.querySelectorAll('.board-arrow');
    arrows.forEach(arrow => arrow.remove());
}