package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/chdb/chessdb/internal/database"
	"github.com/chdb/chessdb/internal/parser"
)

func main() {
	fmt.Println("=== Chess Database Channel Demo ===\n")

	// Initialize database
	db, err := database.New("demo.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// Sample PGN games
	sampleGames := []string{
		`[Event "Example 1"]
[White "Player A"]
[Black "Player B"]
[Result "1-0"]

1.e4 e5 2.Nf3 Nc6 3.Bb5 1-0`,

		`[Event "Example 2"]
[White "Player C"]
[Black "Player D"]
[Result "0-1"]

1.d4 d5 2.c4 e6 3.Nc3 0-1`,

		`[Event "Example 3"]
[White "Player E"]
[Black "Player F"]
[Result "1/2-1/2"]

1.e4 c5 2.Nf3 d6 3.d4 1/2-1/2`,
	}

	// Demo 1: Concurrent parsing with channels
	fmt.Println("1. Concurrent Parsing Demo:")
	concurrentParser := parser.NewConcurrentParser(2) // 2 workers
	
	start := time.Now()
	games, errors := concurrentParser.ParsePGNBatch(sampleGames)
	parseTime := time.Since(start)
	
	fmt.Printf("   Parsed %d games in %v\n", len(games), parseTime)
	for i, err := range errors {
		if err != nil {
			fmt.Printf("   Error parsing game %d: %v\n", i, err)
		}
	}
	fmt.Println()

	// Demo 2: Streaming import with progress
	fmt.Println("2. Streaming Import Demo:")
	
	importer := database.NewBatchImporter(db, 2, 2) // small batches for demo
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	
	// Create game channel
	gameChannel := make(chan *database.Game, 10)
	progressChannel := make(chan database.ImportProgress, 10)
	
	// Start import in background
	go func() {
		defer close(gameChannel)
		for _, game := range games {
			if game != nil {
				// Convert to database.Game (simplified)
				dbGame := &database.Game{
					White:  game.White,
					Black:  game.Black,
					Result: game.Result,
					Event:  game.Event,
					PGN:    game.PGN,
					Moves:  game.Moves,
				}
				gameChannel <- dbGame
			}
		}
	}()
	
	// Monitor progress
	go func() {
		defer close(progressChannel)
		for progress := range progressChannel {
			fmt.Printf("   Progress: %d imported, %d failed, current: %s\n", 
				progress.Imported, progress.Failed, progress.CurrentGame)
		}
	}()
	
	start = time.Now()
	err = importer.ImportWithChannels(ctx, gameChannel, progressChannel)
	importTime := time.Since(start)
	
	if err != nil {
		fmt.Printf("   Import error: %v\n", err)
	}
	
	imported, failed := importer.GetStats()
	fmt.Printf("   Import completed in %v: %d imported, %d failed\n", 
		importTime, imported, failed)
	fmt.Println()

	// Demo 3: Channel patterns showcase
	fmt.Println("3. Channel Patterns Showcase:")
	
	// Producer-consumer pattern
	dataChannel := make(chan string, 5)
	resultChannel := make(chan string, 5)
	
	// Producer goroutine
	go func() {
		defer close(dataChannel)
		for i := 1; i <= 5; i++ {
			data := fmt.Sprintf("data-%d", i)
			fmt.Printf("   Producing: %s\n", data)
			dataChannel <- data
			time.Sleep(100 * time.Millisecond)
		}
	}()
	
	// Consumer goroutine
	go func() {
		defer close(resultChannel)
		for data := range dataChannel {
			result := fmt.Sprintf("processed-%s", data)
			fmt.Printf("   Processing: %s -> %s\n", data, result)
			resultChannel <- result
			time.Sleep(50 * time.Millisecond)
		}
	}()
	
	// Collector
	var results []string
	for result := range resultChannel {
		results = append(results, result)
	}
	
	fmt.Printf("   Collected %d results: %v\n", len(results), results)
	fmt.Println()

	fmt.Println("=== Demo Complete ===")
	fmt.Println("\nKey Channel Features Demonstrated:")
	fmt.Println("✓ Concurrent parsing with worker pools")
	fmt.Println("✓ Streaming import with progress tracking")
	fmt.Println("✓ Producer-consumer patterns")
	fmt.Println("✓ Graceful shutdown with context cancellation")
	fmt.Println("✓ Backpressure handling with buffered channels")
}