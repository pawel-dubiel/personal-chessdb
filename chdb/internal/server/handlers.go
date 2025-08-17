package server

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/chdb/chessdb/internal/database"
	"github.com/chdb/chessdb/internal/models"
	"github.com/chdb/chessdb/internal/parser"
	"github.com/chdb/chessdb/internal/search"
)

type Handler struct {
	db      *database.DB
	parser  *parser.PGNParser
	matcher *search.PatternMatcher
}

func NewHandler(db *database.DB) *Handler {
	return &Handler{
		db:      db,
		parser:  parser.New(),
		matcher: search.NewPatternMatcher(db),
	}
}

func (h *Handler) ImportGames(c *gin.Context) {
	var req struct {
		PGN string `json:"pgn" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	startTime := time.Now()
	games, err := h.parser.ParsePGN(req.PGN)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse PGN: " + err.Error()})
		return
	}

	result := &models.ImportResult{
		TotalGames: len(games),
	}

	for _, game := range games {
		_, positions, err := h.parser.ParseGameWithPositions(game.PGN)
		if err != nil {
			result.FailedGames++
			result.Errors = append(result.Errors, fmt.Sprintf("Failed to extract positions: %v", err))
			continue
		}

		gameID, err := h.db.InsertGameWithPositions(game, positions)
		if err != nil {
			result.FailedGames++
			result.Errors = append(result.Errors, fmt.Sprintf("Failed to insert game: %v", err))
			continue
		}

		if err := h.matcher.IndexGamePatterns(gameID, game.Moves); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("Failed to index patterns for game %d: %v", gameID, err))
		}

		result.ImportedGames++
	}

	result.ProcessingTime = time.Since(startTime).Seconds()
	c.JSON(http.StatusOK, result)
}

func (h *Handler) ImportFile(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to get file: " + err.Error()})
		return
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read file: " + err.Error()})
		return
	}

	startTime := time.Now()
	games, err := h.parser.ParsePGN(string(content))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse PGN: " + err.Error()})
		return
	}

	result := &models.ImportResult{
		TotalGames: len(games),
	}

	for _, game := range games {
		_, positions, err := h.parser.ParseGameWithPositions(game.PGN)
		if err != nil {
			result.FailedGames++
			continue
		}

		gameID, err := h.db.InsertGameWithPositions(game, positions)
		if err != nil {
			result.FailedGames++
			continue
		}

		h.matcher.IndexGamePatterns(gameID, game.Moves)
		result.ImportedGames++
	}

	result.ProcessingTime = time.Since(startTime).Seconds()
	c.JSON(http.StatusOK, gin.H{
		"filename": header.Filename,
		"result":   result,
	})
}

func (h *Handler) SearchGames(c *gin.Context) {
	params := &models.SearchParams{
		Limit:  100,
		Offset: 0,
	}

	params.White = c.Query("white")
	params.Black = c.Query("black")
	params.Either = c.Query("either")
	params.ECO = c.Query("eco")
	params.Opening = c.Query("opening")
	params.Result = c.Query("result")
	params.DateFrom = c.Query("date_from")
	params.DateTo = c.Query("date_to")
	params.Position = c.Query("position")

	if minElo := c.Query("min_elo"); minElo != "" {
		if val, err := strconv.Atoi(minElo); err == nil {
			params.MinElo = val
		}
	}

	if maxElo := c.Query("max_elo"); maxElo != "" {
		if val, err := strconv.Atoi(maxElo); err == nil {
			params.MaxElo = val
		}
	}

	if limit := c.Query("limit"); limit != "" {
		if val, err := strconv.Atoi(limit); err == nil {
			params.Limit = val
		}
	}

	if offset := c.Query("offset"); offset != "" {
		if val, err := strconv.Atoi(offset); err == nil {
			params.Offset = val
		}
	}

	params.IncludeMoves = c.Query("include_moves") == "true"

	var games []*models.Game
	var err error

	if params.Position != "" {
		games, err = h.db.SearchByPosition(params.Position, params.Limit)
	} else {
		games, err = h.db.SearchGames(params)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"games": games,
		"count": len(games),
	})
}

func (h *Handler) SearchByPattern(c *gin.Context) {
	var pattern models.Pattern
	if err := c.ShouldBindJSON(&pattern); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	limit := 100
	if l := c.Query("limit"); l != "" {
		if val, err := strconv.Atoi(l); err == nil {
			limit = val
		}
	}

	games, err := h.matcher.SearchByPattern(&pattern, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"games": games,
		"count": len(games),
	})
}

func (h *Handler) GetGame(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid game ID"})
		return
	}

	game, err := h.db.GetGame(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if game == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Game not found"})
		return
	}

	c.JSON(http.StatusOK, game)
}

func (h *Handler) DeleteGame(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid game ID"})
		return
	}

	if err := h.db.DeleteGame(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Game deleted successfully"})
}

func (h *Handler) GetStats(c *gin.Context) {
	stats, err := h.db.GetStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}

func (h *Handler) HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "healthy",
		"time":   time.Now().UTC(),
	})
}