package parser

import (
	"sync"
	"github.com/chdb/chessdb/internal/models"
)

type ParseJob struct {
	PGN   string
	Index int
}

type ParseResult struct {
	Game  *models.Game
	Index int
	Error error
}

type ConcurrentParser struct {
	parser     *PGNParser
	numWorkers int
}

func NewConcurrentParser(numWorkers int) *ConcurrentParser {
	if numWorkers <= 0 {
		numWorkers = 4
	}
	return &ConcurrentParser{
		parser:     New(),
		numWorkers: numWorkers,
	}
}

func (cp *ConcurrentParser) ParsePGNBatch(pgnTexts []string) ([]*models.Game, []error) {
	jobs := make(chan ParseJob, len(pgnTexts))
	results := make(chan ParseResult, len(pgnTexts))
	
	var wg sync.WaitGroup
	
	for i := 0; i < cp.numWorkers; i++ {
		wg.Add(1)
		go cp.worker(jobs, results, &wg)
	}
	
	go func() {
		for i, pgn := range pgnTexts {
			jobs <- ParseJob{PGN: pgn, Index: i}
		}
		close(jobs)
	}()
	
	go func() {
		wg.Wait()
		close(results)
	}()
	
	games := make([]*models.Game, len(pgnTexts))
	errors := make([]error, len(pgnTexts))
	
	for result := range results {
		if result.Error != nil {
			errors[result.Index] = result.Error
		} else {
			games[result.Index] = result.Game
		}
	}
	
	return games, errors
}

func (cp *ConcurrentParser) worker(jobs <-chan ParseJob, results chan<- ParseResult, wg *sync.WaitGroup) {
	defer wg.Done()
	
	for job := range jobs {
		games, err := cp.parser.ParsePGN(job.PGN)
		if err != nil {
			results <- ParseResult{Index: job.Index, Error: err}
			continue
		}
		
		if len(games) > 0 {
			results <- ParseResult{Game: games[0], Index: job.Index, Error: nil}
		} else {
			results <- ParseResult{Index: job.Index, Error: nil}
		}
	}
}

func (cp *ConcurrentParser) StreamParsePGN(pgnChannel <-chan string) <-chan *models.Game {
	gameChannel := make(chan *models.Game, 100)
	
	go func() {
		defer close(gameChannel)
		
		var wg sync.WaitGroup
		semaphore := make(chan struct{}, cp.numWorkers)
		
		for pgn := range pgnChannel {
			wg.Add(1)
			semaphore <- struct{}{}
			
			go func(pgnText string) {
				defer func() {
					<-semaphore
					wg.Done()
				}()
				
				games, err := cp.parser.ParsePGN(pgnText)
				if err == nil {
					for _, game := range games {
						gameChannel <- game
					}
				}
			}(pgn)
		}
		
		wg.Wait()
	}()
	
	return gameChannel
}