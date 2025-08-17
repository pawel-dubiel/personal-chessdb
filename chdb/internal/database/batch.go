package database

import (
	"context"
	"database/sql"
	"sync"
	"sync/atomic"
	"time"
	
	"github.com/chdb/chessdb/internal/models"
)

type BatchImporter struct {
	db           *DB
	batchSize    int
	numWorkers   int
	importStats  atomic.Uint64
	failedStats  atomic.Uint64
}

func NewBatchImporter(db *DB, batchSize, numWorkers int) *BatchImporter {
	if batchSize <= 0 {
		batchSize = 100
	}
	if numWorkers <= 0 {
		numWorkers = 4
	}
	
	return &BatchImporter{
		db:         db,
		batchSize:  batchSize,
		numWorkers: numWorkers,
	}
}

type ImportJob struct {
	Game      *models.Game
	Positions []Position
}

type ImportProgress struct {
	TotalProcessed uint64
	Imported       uint64
	Failed         uint64
	CurrentGame    string
	Timestamp      time.Time
}

func (bi *BatchImporter) ImportWithChannels(ctx context.Context, gameStream <-chan *models.Game, progressChan chan<- ImportProgress) error {
	jobs := make(chan ImportJob, bi.batchSize)
	errors := make(chan error, bi.numWorkers)
	
	var wg sync.WaitGroup
	
	for i := 0; i < bi.numWorkers; i++ {
		wg.Add(1)
		go bi.importWorker(ctx, jobs, errors, &wg)
	}
	
	go func() {
		defer close(jobs)
		
		for game := range gameStream {
			select {
			case <-ctx.Done():
				return
			default:
				parser := &PGNParserHelper{}
				positions, _ := parser.ExtractPositions(game.Moves)
				
				jobs <- ImportJob{
					Game:      game,
					Positions: positions,
				}
				
				if progressChan != nil {
					progressChan <- ImportProgress{
						TotalProcessed: bi.importStats.Load() + bi.failedStats.Load(),
						Imported:       bi.importStats.Load(),
						Failed:         bi.failedStats.Load(),
						CurrentGame:    game.White + " vs " + game.Black,
						Timestamp:      time.Now(),
					}
				}
			}
		}
	}()
	
	go func() {
		wg.Wait()
		close(errors)
	}()
	
	var lastErr error
	for err := range errors {
		if err != nil {
			lastErr = err
		}
	}
	
	if progressChan != nil {
		close(progressChan)
	}
	
	return lastErr
}

func (bi *BatchImporter) importWorker(ctx context.Context, jobs <-chan ImportJob, errors chan<- error, wg *sync.WaitGroup) {
	defer wg.Done()
	
	batch := make([]ImportJob, 0, bi.batchSize)
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	
	flush := func() {
		if len(batch) == 0 {
			return
		}
		
		tx, err := bi.db.conn.Begin()
		if err != nil {
			errors <- err
			bi.failedStats.Add(uint64(len(batch)))
			batch = batch[:0]
			return
		}
		
		for _, job := range batch {
			_, err := bi.insertGameInTx(tx, job.Game, job.Positions)
			if err != nil {
				bi.failedStats.Add(1)
			} else {
				bi.importStats.Add(1)
			}
		}
		
		if err := tx.Commit(); err != nil {
			errors <- err
			bi.failedStats.Add(uint64(len(batch)))
		}
		
		batch = batch[:0]
	}
	
	for {
		select {
		case <-ctx.Done():
			flush()
			return
			
		case job, ok := <-jobs:
			if !ok {
				flush()
				return
			}
			
			batch = append(batch, job)
			if len(batch) >= bi.batchSize {
				flush()
			}
			
		case <-ticker.C:
			flush()
		}
	}
}

func (bi *BatchImporter) insertGameInTx(tx *sql.Tx, game *models.Game, positions []Position) (int64, error) {
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
	
	return gameID, nil
}

func (bi *BatchImporter) GetStats() (imported, failed uint64) {
	return bi.importStats.Load(), bi.failedStats.Load()
}

func (bi *BatchImporter) ResetStats() {
	bi.importStats.Store(0)
	bi.failedStats.Store(0)
}