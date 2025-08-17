package database

import (
	"strings"
	"github.com/notnil/chess"
)

type PGNParserHelper struct{}

func (p *PGNParserHelper) ExtractPositions(moveText string) ([]Position, error) {
	game := chess.NewGame()
	moves := p.parseMoveText(moveText)
	positions := make([]Position, 0, len(moves))
	
	for i, moveStr := range moves {
		if err := game.MoveStr(moveStr); err != nil {
			continue
		}
		
		fen := game.FEN()
		positions = append(positions, Position{
			MoveNumber: i + 1,
			FEN:        fen,
			Hash:       HashPosition(fen),
		})
	}
	
	return positions, nil
}

func (p *PGNParserHelper) parseMoveText(moveText string) []string {
	moveText = p.cleanMoves(moveText)
	moveText = strings.ReplaceAll(moveText, ".", " ")
	
	parts := strings.Fields(moveText)
	var moves []string
	
	for _, part := range parts {
		if part == "1-0" || part == "0-1" || part == "1/2-1/2" || part == "*" {
			break
		}
		if part != "" && !isNumber(part) {
			moves = append(moves, part)
		}
	}
	
	return moves
}

func (p *PGNParserHelper) cleanMoves(moves string) string {
	moves = strings.ReplaceAll(moves, "{", " ")
	moves = strings.ReplaceAll(moves, "}", " ")
	moves = strings.ReplaceAll(moves, "(", " ")
	moves = strings.ReplaceAll(moves, ")", " ")
	moves = strings.ReplaceAll(moves, "$", " ")
	
	for strings.Contains(moves, "  ") {
		moves = strings.ReplaceAll(moves, "  ", " ")
	}
	
	return strings.TrimSpace(moves)
}

func isNumber(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return len(s) > 0
}