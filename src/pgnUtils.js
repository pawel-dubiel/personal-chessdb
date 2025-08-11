const { Chess } = require('chess.js');

function parsePGN(pgnText) {
  const games = [];
  
  // Normalize line endings and clean up the text
  const normalizedText = pgnText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  
  // Split on [Event to find game boundaries
  // Each game starts with [Event and ends just before the next [Event or at the end
  const parts = normalizedText.split(/(?=\[Event )/);
  
  for (let part of parts) {
    const trimmed = part.trim();
    // A valid game must have at least [Event header and some moves
    if (trimmed && trimmed.startsWith('[Event ')) {
      // Check if it has the basic structure of a PGN game
      const hasHeaders = trimmed.includes('[White ') && trimmed.includes('[Black ');
      const hasResult = trimmed.includes('[Result ');
      
      if (hasHeaders && hasResult) {
        games.push(trimmed);
      }
    }
  }
  
  console.log(`PGN Parser: Found ${games.length} games in the input`);
  
  return games;
}

function extractGameInfo(pgnGame) {
  const headers = {};
  const headerRegex = /\[(\w+)\s+"([^"]*)"\]/g;
  let match;
  
  while ((match = headerRegex.exec(pgnGame)) !== null) {
    headers[match[1]] = match[2];
  }
  
  // Find where headers end and moves begin
  // Moves typically start after a blank line following the headers
  const lines = pgnGame.split('\n');
  let movesStartIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    // Headers are lines starting with [
    if (!lines[i].startsWith('[') && lines[i].trim() !== '') {
      movesStartIndex = i;
      break;
    }
  }
  
  let moves = '';
  if (movesStartIndex !== -1) {
    moves = lines.slice(movesStartIndex).join(' ').trim();
  }
  
  // Clean up the moves text
  moves = moves.replace(/\s+/g, ' ').trim();
  
  // Validate moves with chess.js (optional, for debugging)
  const chess = new Chess();
  try {
    const moveList = moves
      .replace(/\{[^}]*\}/g, '') // Remove comments in curly braces
      .replace(/\([^)]*\)/g, '')  // Remove variations in parentheses
      .replace(/\d+\.\.\./g, '')  // Remove ellipsis move numbers
      .replace(/\d+\./g, '')      // Remove move numbers
      .replace(/\s+/g, ' ')       // Normalize whitespace
      .trim()
      .split(' ')
      .filter(move => move && !['1-0', '0-1', '1/2-1/2', '*'].includes(move));
    
    let validMoveCount = 0;
    for (let move of moveList) {
      try {
        chess.move(move);
        validMoveCount++;
      } catch (e) {
        // Stop at first invalid move
        break;
      }
    }
  } catch (e) {
    // Continue even if move validation fails
  }
  
  return {
    white: headers.White || 'Unknown',
    black: headers.Black || 'Unknown',
    result: headers.Result || '*',
    date: headers.Date || headers.UTCDate || '',
    event: headers.Event || '',
    site: headers.Site || '',
    round: headers.Round || '',
    eco: headers.ECO || '',
    opening: headers.Opening || '',
    moves: moves
  };
}

function searchGames(games, criteria) {
  return games.filter(game => {
    const info = extractGameInfo(game);
    
    if (criteria.white && !info.white.toLowerCase().includes(criteria.white.toLowerCase())) {
      return false;
    }
    if (criteria.black && !info.black.toLowerCase().includes(criteria.black.toLowerCase())) {
      return false;
    }
    if (criteria.opening && !info.opening.toLowerCase().includes(criteria.opening.toLowerCase())) {
      return false;
    }
    if (criteria.eco && !info.eco.includes(criteria.eco)) {
      return false;
    }
    if (criteria.result && info.result !== criteria.result) {
      return false;
    }
    
    return true;
  });
}

module.exports = {
  parsePGN,
  extractGameInfo,
  searchGames
};