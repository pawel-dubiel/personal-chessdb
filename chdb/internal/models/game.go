package models

import (
	"time"
)

type Game struct {
	ID           int64     `json:"id"`
	Event        string    `json:"event"`
	Site         string    `json:"site"`
	Date         string    `json:"date"`
	Round        string    `json:"round"`
	White        string    `json:"white"`
	Black        string    `json:"black"`
	Result       string    `json:"result"`
	WhiteElo     int       `json:"white_elo,omitempty"`
	BlackElo     int       `json:"black_elo,omitempty"`
	ECO          string    `json:"eco,omitempty"`
	Opening      string    `json:"opening,omitempty"`
	Variation    string    `json:"variation,omitempty"`
	PGN          string    `json:"pgn"`
	Moves        string    `json:"moves"`
	FEN          string    `json:"fen,omitempty"`
	Positions    []byte    `json:"-"`
	PositionHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type SearchParams struct {
	White          string   `json:"white,omitempty"`
	Black          string   `json:"black,omitempty"`
	Either         string   `json:"either,omitempty"`
	ECO            string   `json:"eco,omitempty"`
	Opening        string   `json:"opening,omitempty"`
	Result         string   `json:"result,omitempty"`
	DateFrom       string   `json:"date_from,omitempty"`
	DateTo         string   `json:"date_to,omitempty"`
	MinElo         int      `json:"min_elo,omitempty"`
	MaxElo         int      `json:"max_elo,omitempty"`
	Position       string   `json:"position,omitempty"`
	Pattern        *Pattern `json:"pattern,omitempty"`
	IncludeMoves   bool     `json:"include_moves,omitempty"`
	Limit          int      `json:"limit,omitempty"`
	Offset         int      `json:"offset,omitempty"`
}

type Pattern struct {
	Board    [8][8]SquarePattern `json:"board"`
	SideToMove string            `json:"side_to_move,omitempty"`
}

type SquarePattern struct {
	Pieces []string `json:"pieces,omitempty"`
	Empty  bool     `json:"empty,omitempty"`
	Any    bool     `json:"any,omitempty"`
}

type ImportResult struct {
	TotalGames     int      `json:"total_games"`
	ImportedGames  int      `json:"imported_games"`
	FailedGames    int      `json:"failed_games"`
	Errors         []string `json:"errors,omitempty"`
	ProcessingTime float64  `json:"processing_time_seconds"`
}