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
    
    // Add guess mode toggle
    document.getElementById('toggleGuessMode').addEventListener('click', toggleGuessMode);
    
    // Add keyboard support for navigation
    document.addEventListener('keydown', handleKeyDown);
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
        draggable: false,
        // Use local chess piece images
        pieceTheme: './img/chesspieces/{piece}.png',
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

function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `result-message ${type}`;
    element.style.display = 'block';
    
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
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
        analysisInfo.style.display = 'block';
        
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
        }
        
        if (pv.length > 0) {
            console.log('PV found with length:', pv.length, 'moves:', pv); // Debug
            updatePrincipalVariation(pv);
            // Update best move in real-time from the first move in principal variation
            if (pv[0]) {
                currentBestMove = pv[0];
                updateBestMoveDisplay(pv[0]);
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