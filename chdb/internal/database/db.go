package database

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/chdb/chessdb/internal/models"
)

type DB struct {
	conn *sql.DB
}

func New(dbPath string) (*DB, error) {
	conn, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_synchronous=NORMAL&_cache_size=10000&_busy_timeout=5000")
	if err != nil {
		return nil, err
	}

	db := &DB{conn: conn}
	if err := db.createTables(); err != nil {
		return nil, err
	}

	return db, nil
}

func (db *DB) createTables() error {
	schema := `
	CREATE TABLE IF NOT EXISTS games (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		event TEXT,
		site TEXT,
		date TEXT,
		round TEXT,
		white TEXT NOT NULL,
		black TEXT NOT NULL,
		result TEXT NOT NULL,
		white_elo INTEGER,
		black_elo INTEGER,
		eco TEXT,
		opening TEXT,
		variation TEXT,
		pgn TEXT NOT NULL,
		moves TEXT NOT NULL,
		fen TEXT,
		positions BLOB,
		position_hash TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_white ON games(white);
	CREATE INDEX IF NOT EXISTS idx_black ON games(black);
	CREATE INDEX IF NOT EXISTS idx_date ON games(date);
	CREATE INDEX IF NOT EXISTS idx_eco ON games(eco);
	CREATE INDEX IF NOT EXISTS idx_result ON games(result);
	CREATE INDEX IF NOT EXISTS idx_white_elo ON games(white_elo);
	CREATE INDEX IF NOT EXISTS idx_black_elo ON games(black_elo);
	CREATE INDEX IF NOT EXISTS idx_position_hash ON games(position_hash);
	CREATE INDEX IF NOT EXISTS idx_white_black ON games(white, black);
	CREATE INDEX IF NOT EXISTS idx_date_result ON games(date, result);

	CREATE TABLE IF NOT EXISTS position_index (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		game_id INTEGER NOT NULL,
		move_number INTEGER NOT NULL,
		fen TEXT NOT NULL,
		position_hash TEXT NOT NULL,
		FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_position_fen ON position_index(fen);
	CREATE INDEX IF NOT EXISTS idx_position_hash_lookup ON position_index(position_hash);
	CREATE INDEX IF NOT EXISTS idx_position_game_id ON position_index(game_id);

	CREATE TABLE IF NOT EXISTS piece_patterns (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		game_id INTEGER NOT NULL,
		move_number INTEGER NOT NULL,
		pattern_hash TEXT NOT NULL,
		board_state TEXT NOT NULL,
		FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_pattern_hash ON piece_patterns(pattern_hash);
	CREATE INDEX IF NOT EXISTS idx_pattern_game_id ON piece_patterns(game_id);

	`

	_, err := db.conn.Exec(schema)
	return err
}

func (db *DB) InsertGame(game *models.Game) (int64, error) {
	query := `
		INSERT INTO games (
			event, site, date, round, white, black, result,
			white_elo, black_elo, eco, opening, variation,
			pgn, moves, fen, positions, position_hash
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	result, err := db.conn.Exec(query,
		game.Event, game.Site, game.Date, game.Round,
		game.White, game.Black, game.Result,
		game.WhiteElo, game.BlackElo, game.ECO,
		game.Opening, game.Variation,
		game.PGN, game.Moves, game.FEN,
		game.Positions, game.PositionHash,
	)

	if err != nil {
		return 0, err
	}

	return result.LastInsertId()
}

func (db *DB) InsertGameWithPositions(game *models.Game, positions []Position) (int64, error) {
	tx, err := db.conn.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	query := `
		INSERT INTO games (
			event, site, date, round, white, black, result,
			white_elo, black_elo, eco, opening, variation,
			pgn, moves, fen, positions, position_hash
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	result, err := tx.Exec(query,
		game.Event, game.Site, game.Date, game.Round,
		game.White, game.Black, game.Result,
		game.WhiteElo, game.BlackElo, game.ECO,
		game.Opening, game.Variation,
		game.PGN, game.Moves, game.FEN,
		game.Positions, game.PositionHash,
	)

	if err != nil {
		return 0, err
	}

	gameID, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}

	for _, pos := range positions {
		_, err = tx.Exec(
			"INSERT INTO position_index (game_id, move_number, fen, position_hash) VALUES (?, ?, ?, ?)",
			gameID, pos.MoveNumber, pos.FEN, pos.Hash,
		)
		if err != nil {
			return 0, err
		}
	}

	return gameID, tx.Commit()
}

func (db *DB) SearchGames(params *models.SearchParams) ([]*models.Game, error) {
	var conditions []string
	var args []interface{}

	if params.White != "" {
		conditions = append(conditions, "white LIKE ?")
		args = append(args, "%"+params.White+"%")
	}

	if params.Black != "" {
		conditions = append(conditions, "black LIKE ?")
		args = append(args, "%"+params.Black+"%")
	}

	if params.Either != "" {
		conditions = append(conditions, "(white LIKE ? OR black LIKE ?)")
		args = append(args, "%"+params.Either+"%", "%"+params.Either+"%")
	}

	if params.ECO != "" {
		conditions = append(conditions, "eco = ?")
		args = append(args, params.ECO)
	}

	if params.Opening != "" {
		conditions = append(conditions, "opening LIKE ?")
		args = append(args, "%"+params.Opening+"%")
	}

	if params.Result != "" {
		conditions = append(conditions, "result = ?")
		args = append(args, params.Result)
	}

	if params.DateFrom != "" {
		conditions = append(conditions, "date >= ?")
		args = append(args, params.DateFrom)
	}

	if params.DateTo != "" {
		conditions = append(conditions, "date <= ?")
		args = append(args, params.DateTo)
	}

	if params.MinElo > 0 {
		conditions = append(conditions, "(white_elo >= ? OR black_elo >= ?)")
		args = append(args, params.MinElo, params.MinElo)
	}

	if params.MaxElo > 0 {
		conditions = append(conditions, "(white_elo <= ? AND black_elo <= ?)")
		args = append(args, params.MaxElo, params.MaxElo)
	}

	query := "SELECT id, event, site, date, round, white, black, result, white_elo, black_elo, eco, opening, variation"
	
	if params.IncludeMoves {
		query += ", pgn, moves"
	} else {
		query += ", '', ''"
	}
	
	query += ", created_at, updated_at FROM games"

	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}

	query += " ORDER BY date DESC, id DESC"

	if params.Limit > 0 {
		query += fmt.Sprintf(" LIMIT %d", params.Limit)
		if params.Offset > 0 {
			query += fmt.Sprintf(" OFFSET %d", params.Offset)
		}
	}

	rows, err := db.conn.Query(query, args...)
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

func (db *DB) SearchByPosition(fen string, limit int) ([]*models.Game, error) {
	hash := HashPosition(fen)
	
	query := `
		SELECT DISTINCT g.id, g.event, g.site, g.date, g.round, 
		       g.white, g.black, g.result, g.white_elo, g.black_elo,
		       g.eco, g.opening, g.variation, g.pgn, g.moves,
		       g.created_at, g.updated_at
		FROM games g
		JOIN position_index p ON g.id = p.game_id
		WHERE p.position_hash = ?
		ORDER BY g.date DESC
		LIMIT ?
	`

	rows, err := db.conn.Query(query, hash, limit)
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

func (db *DB) GetGame(id int64) (*models.Game, error) {
	query := `
		SELECT id, event, site, date, round, white, black, result,
		       white_elo, black_elo, eco, opening, variation,
		       pgn, moves, created_at, updated_at
		FROM games WHERE id = ?
	`

	game := &models.Game{}
	err := db.conn.QueryRow(query, id).Scan(
		&game.ID, &game.Event, &game.Site, &game.Date, &game.Round,
		&game.White, &game.Black, &game.Result,
		&game.WhiteElo, &game.BlackElo,
		&game.ECO, &game.Opening, &game.Variation,
		&game.PGN, &game.Moves,
		&game.CreatedAt, &game.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}

	return game, err
}

func (db *DB) DeleteGame(id int64) error {
	_, err := db.conn.Exec("DELETE FROM games WHERE id = ?", id)
	return err
}

func (db *DB) GetStats() (map[string]interface{}, error) {
	stats := make(map[string]interface{})

	var totalGames int
	err := db.conn.QueryRow("SELECT COUNT(*) FROM games").Scan(&totalGames)
	if err != nil {
		return nil, err
	}
	stats["total_games"] = totalGames

	var totalPositions int
	err = db.conn.QueryRow("SELECT COUNT(*) FROM position_index").Scan(&totalPositions)
	if err != nil {
		return nil, err
	}
	stats["total_positions"] = totalPositions

	var dbSize int64
	err = db.conn.QueryRow("SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()").Scan(&dbSize)
	if err != nil {
		return nil, err
	}
	stats["database_size_bytes"] = dbSize

	stats["last_updated"] = time.Now().UTC()

	return stats, nil
}

func (db *DB) Close() error {
	return db.conn.Close()
}

type Position struct {
	MoveNumber int
	FEN        string
	Hash       string
}