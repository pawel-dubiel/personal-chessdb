package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/chdb/chessdb/internal/database"
	"github.com/chdb/chessdb/internal/server"
)

func main() {
	var (
		port   = flag.String("port", "8080", "Server port")
		dbPath = flag.String("db", "./chess.db", "Database path")
	)
	flag.Parse()

	db, err := database.New(*dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	router := server.SetupRouter(db)
	
	fmt.Printf("Chess Database Server starting on port %s\n", *port)
	fmt.Printf("Database: %s\n", *dbPath)
	fmt.Println("\nAPI Endpoints:")
	fmt.Println("  POST   /api/v1/games/import         - Import PGN text")
	fmt.Println("  POST   /api/v1/games/import/file    - Import PGN file")
	fmt.Println("  GET    /api/v1/games/search         - Search games")
	fmt.Println("  POST   /api/v1/games/search/pattern - Search by pattern")
	fmt.Println("  GET    /api/v1/games/:id            - Get game by ID")
	fmt.Println("  DELETE /api/v1/games/:id            - Delete game")
	fmt.Println("  GET    /api/v1/stats                - Database statistics")
	fmt.Println("  GET    /api/v1/health               - Health check")
	
	if err := router.Run(":" + *port); err != nil {
		fmt.Fprintf(os.Stderr, "Server failed to start: %v\n", err)
		os.Exit(1)
	}
}