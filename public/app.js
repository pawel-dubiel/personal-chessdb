let currentGame = null;
let board = null;
let game = null;
let moveHistory = [];
let currentMoveIndex = -1;
let autoPlay = false;
let currentPage = 1;
let currentPageSize = 50;
let currentSearchParams = {};

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
});

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
}

function initializeBoard() {
    const config = {
        position: 'start',
        draggable: false,
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
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