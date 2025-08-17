package parser

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/notnil/chess"
	"github.com/chdb/chessdb/internal/database"
	"github.com/chdb/chessdb/internal/models"
)

var (
	headerRegex = regexp.MustCompile(`\[(\w+)\s+"([^"]+)"\]`)
	moveRegex   = regexp.MustCompile(`\d+\.`)
)

type PGNParser struct{}

func New() *PGNParser {
	return &PGNParser{}
}

func (p *PGNParser) ParsePGN(pgnText string) ([]*models.Game, error) {
	games := p.splitGames(pgnText)
	parsedGames := make([]*models.Game, 0, len(games))

	for _, gameText := range games {
		game, err := p.parseGame(gameText)
		if err != nil {
			continue
		}
		parsedGames = append(parsedGames, game)
	}

	return parsedGames, nil
}

func (p *PGNParser) ParseGameWithPositions(pgnText string) (*models.Game, []database.Position, error) {
	game, err := p.parseGame(pgnText)
	if err != nil {
		return nil, nil, err
	}

	positions, err := p.extractPositions(game.Moves)
	if err != nil {
		return nil, nil, err
	}

	return game, positions, nil
}

func (p *PGNParser) splitGames(pgnText string) []string {
	lines := strings.Split(pgnText, "\n")
	var games []string
	var currentGame strings.Builder
	inGame := false

	for _, line := range lines {
		if strings.HasPrefix(line, "[Event ") {
			if inGame && currentGame.Len() > 0 {
				games = append(games, currentGame.String())
				currentGame.Reset()
			}
			inGame = true
		}
		if inGame {
			currentGame.WriteString(line + "\n")
		}
	}

	if currentGame.Len() > 0 {
		games = append(games, currentGame.String())
	}

	return games
}

func (p *PGNParser) parseGame(gameText string) (*models.Game, error) {
	lines := strings.Split(gameText, "\n")
	game := &models.Game{}
	headers := make(map[string]string)
	var moveLines []string
	headerSection := true

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			if len(headers) > 0 {
				headerSection = false
			}
			continue
		}

		if headerSection && strings.HasPrefix(line, "[") {
			matches := headerRegex.FindStringSubmatch(line)
			if len(matches) == 3 {
				headers[matches[1]] = matches[2]
			}
		} else if !strings.HasPrefix(line, "[") {
			headerSection = false
			moveLines = append(moveLines, line)
		}
	}

	game.Event = headers["Event"]
	game.Site = headers["Site"]
	game.Date = headers["Date"]
	game.Round = headers["Round"]
	game.White = headers["White"]
	game.Black = headers["Black"]
	game.Result = headers["Result"]
	game.ECO = headers["ECO"]
	game.Opening = headers["Opening"]
	game.Variation = headers["Variation"]
	game.FEN = headers["FEN"]

	if elo, err := strconv.Atoi(headers["WhiteElo"]); err == nil {
		game.WhiteElo = elo
	}
	if elo, err := strconv.Atoi(headers["BlackElo"]); err == nil {
		game.BlackElo = elo
	}

	if game.White == "" || game.Black == "" || game.Result == "" {
		return nil, fmt.Errorf("missing required fields")
	}

	moves := strings.Join(moveLines, " ")
	moves = p.cleanMoves(moves)
	game.Moves = moves

	var pgnBuilder strings.Builder
	for key, value := range headers {
		pgnBuilder.WriteString(fmt.Sprintf("[%s \"%s\"]\n", key, value))
	}
	pgnBuilder.WriteString("\n")
	pgnBuilder.WriteString(moves)
	game.PGN = pgnBuilder.String()

	return game, nil
}

func (p *PGNParser) cleanMoves(moves string) string {
	moves = regexp.MustCompile(`\{[^}]*\}`).ReplaceAllString(moves, "")
	moves = regexp.MustCompile(`\([^)]*\)`).ReplaceAllString(moves, "")
	moves = regexp.MustCompile(`\$\d+`).ReplaceAllString(moves, "")
	moves = regexp.MustCompile(`\s+`).ReplaceAllString(moves, " ")
	return strings.TrimSpace(moves)
}

func (p *PGNParser) extractPositions(moveText string) ([]database.Position, error) {
	game := chess.NewGame()
	moves := p.parseMoveText(moveText)
	positions := make([]database.Position, 0, len(moves))

	for i, moveStr := range moves {
		if err := game.MoveStr(moveStr); err != nil {
			continue
		}
		
		fen := game.FEN()
		positions = append(positions, database.Position{
			MoveNumber: i + 1,
			FEN:        fen,
			Hash:       database.HashPosition(fen),
		})
	}

	return positions, nil
}

func (p *PGNParser) parseMoveText(moveText string) []string {
	moveText = p.cleanMoves(moveText)
	moveText = moveRegex.ReplaceAllString(moveText, "")
	
	parts := strings.Fields(moveText)
	var moves []string
	
	for _, part := range parts {
		if part == "1-0" || part == "0-1" || part == "1/2-1/2" || part == "*" {
			break
		}
		if part != "" && !strings.HasSuffix(part, ".") {
			moves = append(moves, part)
		}
	}
	
	return moves
}