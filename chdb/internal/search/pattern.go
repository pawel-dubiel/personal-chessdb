package search

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/notnil/chess"
	"github.com/chdb/chessdb/internal/database"
	"github.com/chdb/chessdb/internal/models"
)

type PatternMatcher struct {
	db *database.DB
}

func NewPatternMatcher(db *database.DB) *PatternMatcher {
	return &PatternMatcher{db: db}
}

func (pm *PatternMatcher) SearchByPattern(pattern *models.Pattern, limit int) ([]*models.Game, error) {
	patternHash := pm.hashPattern(pattern)
	
	query := `
		SELECT DISTINCT g.id, g.event, g.site, g.date, g.round,
		       g.white, g.black, g.result, g.white_elo, g.black_elo,
		       g.eco, g.opening, g.variation, g.pgn, g.moves,
		       g.created_at, g.updated_at
		FROM games g
		JOIN piece_patterns pp ON g.id = pp.game_id
		WHERE pp.pattern_hash = ?
		ORDER BY g.date DESC
		LIMIT ?
	`
	
	return pm.executeQuery(query, patternHash, limit)
}

func (pm *PatternMatcher) MatchesPattern(fen string, pattern *models.Pattern) bool {
	board := pm.fenToBoard(fen)
	
	for rank := 0; rank < 8; rank++ {
		for file := 0; file < 8; file++ {
			squarePattern := pattern.Board[rank][file]
			
			if squarePattern.Any {
				continue
			}
			
			piece := board[rank][file]
			
			if squarePattern.Empty {
				if piece != "" {
					return false
				}
				continue
			}
			
			if len(squarePattern.Pieces) > 0 {
				found := false
				for _, allowedPiece := range squarePattern.Pieces {
					if piece == allowedPiece {
						found = true
						break
					}
				}
				if !found {
					return false
				}
			}
		}
	}
	
	if pattern.SideToMove != "" {
		parts := strings.Split(fen, " ")
		if len(parts) > 1 {
			sideToMove := parts[1]
			if (pattern.SideToMove == "white" && sideToMove != "w") ||
			   (pattern.SideToMove == "black" && sideToMove != "b") {
				return false
			}
		}
	}
	
	return true
}

func (pm *PatternMatcher) IndexGamePatterns(gameID int64, moves string) error {
	game := chess.NewGame()
	moveList := pm.parseMoves(moves)
	
	tx, err := pm.db.GetConn().Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	
	for i, moveStr := range moveList {
		if err := game.MoveStr(moveStr); err != nil {
			continue
		}
		
		fen := game.FEN()
		patterns := pm.extractPatterns(fen)
		
		for _, pattern := range patterns {
			patternJSON, _ := json.Marshal(pattern)
			patternHash := database.HashPattern(string(patternJSON))
			
			_, err = tx.Exec(
				"INSERT INTO piece_patterns (game_id, move_number, pattern_hash, board_state) VALUES (?, ?, ?, ?)",
				gameID, i+1, patternHash, string(patternJSON),
			)
			if err != nil {
				return err
			}
		}
	}
	
	return tx.Commit()
}

func (pm *PatternMatcher) extractPatterns(fen string) []map[string]interface{} {
	board := pm.fenToBoard(fen)
	var patterns []map[string]interface{}
	
	patterns = append(patterns, pm.extractPawnStructure(board))
	patterns = append(patterns, pm.extractPieceConfiguration(board))
	patterns = append(patterns, pm.extractKingSafety(board))
	
	return patterns
}

func (pm *PatternMatcher) extractPawnStructure(board [8][8]string) map[string]interface{} {
	pattern := make(map[string]interface{})
	pattern["type"] = "pawn_structure"
	
	whitePawns := []string{}
	blackPawns := []string{}
	
	for rank := 0; rank < 8; rank++ {
		for file := 0; file < 8; file++ {
			piece := board[rank][file]
			if piece == "P" {
				whitePawns = append(whitePawns, fmt.Sprintf("%c%d", 'a'+file, 8-rank))
			} else if piece == "p" {
				blackPawns = append(blackPawns, fmt.Sprintf("%c%d", 'a'+file, 8-rank))
			}
		}
	}
	
	pattern["white_pawns"] = whitePawns
	pattern["black_pawns"] = blackPawns
	
	return pattern
}

func (pm *PatternMatcher) extractPieceConfiguration(board [8][8]string) map[string]interface{} {
	pattern := make(map[string]interface{})
	pattern["type"] = "piece_configuration"
	
	pieces := make(map[string][]string)
	pieceTypes := []string{"K", "Q", "R", "B", "N", "k", "q", "r", "b", "n"}
	
	for _, pieceType := range pieceTypes {
		pieces[pieceType] = []string{}
	}
	
	for rank := 0; rank < 8; rank++ {
		for file := 0; file < 8; file++ {
			piece := board[rank][file]
			if piece != "" && piece != "P" && piece != "p" {
				square := fmt.Sprintf("%c%d", 'a'+file, 8-rank)
				pieces[piece] = append(pieces[piece], square)
			}
		}
	}
	
	pattern["pieces"] = pieces
	return pattern
}

func (pm *PatternMatcher) extractKingSafety(board [8][8]string) map[string]interface{} {
	pattern := make(map[string]interface{})
	pattern["type"] = "king_safety"
	
	for rank := 0; rank < 8; rank++ {
		for file := 0; file < 8; file++ {
			piece := board[rank][file]
			if piece == "K" {
				pattern["white_king"] = fmt.Sprintf("%c%d", 'a'+file, 8-rank)
				pattern["white_king_castled"] = file >= 6 || file <= 2
			} else if piece == "k" {
				pattern["black_king"] = fmt.Sprintf("%c%d", 'a'+file, 8-rank)
				pattern["black_king_castled"] = file >= 6 || file <= 2
			}
		}
	}
	
	return pattern
}

func (pm *PatternMatcher) fenToBoard(fen string) [8][8]string {
	var board [8][8]string
	parts := strings.Split(fen, " ")
	if len(parts) == 0 {
		return board
	}
	
	rows := strings.Split(parts[0], "/")
	for rank, row := range rows {
		file := 0
		for _, char := range row {
			if char >= '1' && char <= '8' {
				skip := int(char - '0')
				for i := 0; i < skip; i++ {
					if file < 8 {
						board[rank][file] = ""
						file++
					}
				}
			} else {
				if file < 8 {
					board[rank][file] = string(char)
					file++
				}
			}
		}
	}
	
	return board
}

func (pm *PatternMatcher) parseMoves(moveText string) []string {
	moveText = strings.TrimSpace(moveText)
	parts := strings.Fields(moveText)
	var moves []string
	
	for _, part := range parts {
		if part == "1-0" || part == "0-1" || part == "1/2-1/2" || part == "*" {
			break
		}
		if !strings.Contains(part, ".") && part != "" {
			moves = append(moves, part)
		}
	}
	
	return moves
}

func (pm *PatternMatcher) hashPattern(pattern *models.Pattern) string {
	patternJSON, _ := json.Marshal(pattern)
	return database.HashPattern(string(patternJSON))
}

func (pm *PatternMatcher) executeQuery(query string, args ...interface{}) ([]*models.Game, error) {
	rows, err := pm.db.GetConn().Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var games []*models.Game
	for rows.Next() {
		game := &models.Game{}
		err := rows.Scan(
			&game.ID, &game.Event, &game.Site, &game.Date, &game.Round,
			&game.White, &game.Black, &game.Result,
			&game.WhiteElo, &game.BlackElo,
			&game.ECO, &game.Opening, &game.Variation,
			&game.PGN, &game.Moves,
			&game.CreatedAt, &game.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		games = append(games, game)
	}
	
	return games, nil
}