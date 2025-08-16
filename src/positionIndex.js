const { Chess } = require('chess.js');

function generateZobristKeys() {
  const pieces = ['p', 'n', 'b', 'r', 'q', 'k', 'P', 'N', 'B', 'R', 'Q', 'K'];
  const keys = {};
  
  for (let square = 0; square < 64; square++) {
    keys[square] = {};
    for (let piece of pieces) {
      keys[square][piece] = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    }
  }
  
  keys.blackToMove = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  keys.castling = {
    'K': Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
    'Q': Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
    'k': Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
    'q': Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
  };
  
  return keys;
}

const zobristKeys = generateZobristKeys();

function computeZobristHash(fen) {
  const parts = fen.split(' ');
  const board = parts[0];
  const turn = parts[1];
  const castling = parts[2];
  
  let hash = 0;
  let square = 0;
  
  for (let char of board) {
    if (char === '/') continue;
    if (char >= '1' && char <= '8') {
      square += parseInt(char);
    } else {
      const file = square % 8;
      const rank = Math.floor(square / 8);
      const squareIndex = rank * 8 + file;
      hash ^= zobristKeys[squareIndex][char];
      square++;
    }
  }
  
  if (turn === 'b') {
    hash ^= zobristKeys.blackToMove;
  }
  
  if (castling !== '-') {
    for (let right of castling) {
      if (zobristKeys.castling[right]) {
        hash ^= zobristKeys.castling[right];
      }
    }
  }
  
  return hash.toString();
}

function getMaterialSignature(fen) {
  const board = fen.split(' ')[0];
  const counts = {
    'P': 0, 'N': 0, 'B': 0, 'R': 0, 'Q': 0, 'K': 0,
    'p': 0, 'n': 0, 'b': 0, 'r': 0, 'q': 0, 'k': 0
  };
  
  for (let char of board) {
    if (counts.hasOwnProperty(char)) {
      counts[char]++;
    }
  }
  
  return `${counts.P}${counts.N}${counts.B}${counts.R}${counts.Q}${counts.K}-${counts.p}${counts.n}${counts.b}${counts.r}${counts.q}${counts.k}`;
}

function normalizeFEN(fen) {
  const parts = fen.split(' ');
  return parts.slice(0, 4).join(' ');
}

function extractAllPositions(pgn) {
  const positions = [];
  const chess = new Chess();
  
  try {
    const moveList = pgn
      .replace(/\{[^}]*\}/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/\d+\.\.\./g, '')
      .replace(/\d+\./g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(move => move && !['1-0', '0-1', '1/2-1/2', '*'].includes(move));
    
    positions.push({
      fen: chess.fen(),
      moveNumber: 0,
      move: null
    });
    
    let moveNumber = 1;
    for (let move of moveList) {
      try {
        const moveObj = chess.move(move);
        if (moveObj) {
          positions.push({
            fen: chess.fen(),
            moveNumber: Math.floor((moveNumber + 1) / 2),
            move: moveObj.san
          });
          moveNumber++;
        }
      } catch (e) {
        break;
      }
    }
  } catch (e) {
    console.error('Error extracting positions:', e);
  }
  
  return positions;
}

function searchPositionPattern(targetFen, searchType = 'exact') {
  const targetParts = targetFen.split(' ');
  const targetBoard = targetParts[0];
  
  if (searchType === 'exact') {
    return (fen) => {
      const parts = fen.split(' ');
      return parts[0] === targetBoard;
    };
  } else if (searchType === 'material') {
    const targetSignature = getMaterialSignature(targetFen);
    return (fen) => {
      return getMaterialSignature(fen) === targetSignature;
    };
  } else if (searchType === 'pattern') {
    const targetRanks = targetBoard.split('/');
    const piecePositions = [];
    
    for (let rank = 0; rank < 8; rank++) {
      let file = 0;
      for (let char of targetRanks[rank]) {
        if (char >= '1' && char <= '8') {
          file += parseInt(char);
        } else {
          piecePositions.push({
            piece: char,
            rank: rank,
            file: file
          });
          file++;
        }
      }
    }
    
    return (fen) => {
      const fenRanks = fen.split(' ')[0].split('/');
      
      for (let pos of piecePositions) {
        let file = 0;
        let found = false;
        
        for (let char of fenRanks[pos.rank]) {
          if (char >= '1' && char <= '8') {
            const emptySquares = parseInt(char);
            if (file <= pos.file && pos.file < file + emptySquares) {
              return false;
            }
            file += emptySquares;
          } else {
            if (file === pos.file && char === pos.piece) {
              found = true;
              break;
            }
            file++;
          }
        }
        
        if (!found) return false;
      }
      
      return true;
    };
  }
  
  return () => false;
}

function extractPatternFromPosition(fen) {
  // Extract only non-empty squares as patterns
  const board = fen.split(' ')[0];
  const ranks = board.split('/');
  const patterns = [];
  
  for (let rank = 0; rank < 8; rank++) {
    let file = 0;
    for (let char of ranks[rank]) {
      if (char >= '1' && char <= '8') {
        file += parseInt(char);
      } else {
        const square = String.fromCharCode(97 + file) + (8 - rank);
        patterns.push(`${char}@${square}`);
        file++;
      }
    }
  }
  
  return patterns.sort().join(',');
}

function createPatternFromPieces(pieces) {
  // pieces is an array like [{ piece: 'P', square: 'd4' }, { piece: 'K', square: 'e1' }]
  const fenBoard = Array(8).fill(null).map(() => Array(8).fill(null));
  
  for (let { piece, square } of pieces) {
    const file = square.charCodeAt(0) - 97; // a=0, b=1, etc.
    const rank = 8 - parseInt(square[1]); // 8=0, 7=1, etc.
    
    if (rank >= 0 && rank < 8 && file >= 0 && file < 8) {
      fenBoard[rank][file] = piece;
    }
  }
  
  // Convert to FEN format
  const fenRanks = [];
  for (let rank = 0; rank < 8; rank++) {
    let fenRank = '';
    let emptyCount = 0;
    
    for (let file = 0; file < 8; file++) {
      if (fenBoard[rank][file]) {
        if (emptyCount > 0) {
          fenRank += emptyCount;
          emptyCount = 0;
        }
        fenRank += fenBoard[rank][file];
      } else {
        emptyCount++;
      }
    }
    
    if (emptyCount > 0) {
      fenRank += emptyCount;
    }
    
    fenRanks.push(fenRank);
  }
  
  return fenRanks.join('/') + ' w - - 0 1';
}

module.exports = {
  computeZobristHash,
  getMaterialSignature,
  normalizeFEN,
  extractAllPositions,
  searchPositionPattern,
  extractPatternFromPosition,
  createPatternFromPieces
};