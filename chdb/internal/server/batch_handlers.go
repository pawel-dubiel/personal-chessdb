package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/chdb/chessdb/internal/database"
	"github.com/chdb/chessdb/internal/parser"
)

type ProgressResponse struct {
	JobID          string    `json:"job_id"`
	Status         string    `json:"status"`
	TotalProcessed uint64    `json:"total_processed"`
	Imported       uint64    `json:"imported"`
	Failed         uint64    `json:"failed"`
	CurrentGame    string    `json:"current_game,omitempty"`
	StartTime      time.Time `json:"start_time"`
	LastUpdate     time.Time `json:"last_update"`
}

type BatchHandler struct {
	db       *database.DB
	parser   *parser.ConcurrentParser
	importer *database.BatchImporter
	jobs     map[string]*ImportJob
}

type ImportJob struct {
	ID           string
	Status       string
	Progress     *ProgressResponse
	Context      context.Context
	CancelFunc   context.CancelFunc
	ProgressChan chan database.ImportProgress
}

func NewBatchHandler(db *database.DB) *BatchHandler {
	return &BatchHandler{
		db:       db,
		parser:   parser.NewConcurrentParser(8),
		importer: database.NewBatchImporter(db, 50, 4),
		jobs:     make(map[string]*ImportJob),
	}
}

func (bh *BatchHandler) ImportLargeFile(c *gin.Context) {
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

	jobID := generateJobID()
	ctx, cancel := context.WithCancel(context.Background())
	progressChan := make(chan database.ImportProgress, 100)

	job := &ImportJob{
		ID:           jobID,
		Status:       "running",
		Context:      ctx,
		CancelFunc:   cancel,
		ProgressChan: progressChan,
		Progress: &ProgressResponse{
			JobID:     jobID,
			Status:    "running",
			StartTime: time.Now(),
		},
	}

	bh.jobs[jobID] = job

	go bh.processLargeImport(ctx, string(content), progressChan, job)

	c.JSON(http.StatusAccepted, gin.H{
		"job_id":   jobID,
		"filename": header.Filename,
		"status":   "started",
		"message":  "Import started. Use GET /api/v1/games/import/progress/" + jobID + " to check progress",
	})
}

func (bh *BatchHandler) processLargeImport(ctx context.Context, pgnContent string, progressChan chan database.ImportProgress, job *ImportJob) {
	defer func() {
		job.Status = "completed"
		job.Progress.Status = "completed"
		job.Progress.LastUpdate = time.Now()
	}()

	pgnTexts := strings.Split(pgnContent, "\n\n\n")
	
	pgnChannel := make(chan string, 100)
	
	go func() {
		defer close(pgnChannel)
		for _, pgn := range pgnTexts {
			if strings.TrimSpace(pgn) != "" {
				select {
				case pgnChannel <- pgn:
				case <-ctx.Done():
					return
				}
			}
		}
	}()

	gameChannel := bh.parser.StreamParsePGN(pgnChannel)

	if err := bh.importer.ImportWithChannels(ctx, gameChannel, progressChan); err != nil {
		job.Status = "failed"
		job.Progress.Status = "failed"
	}

	imported, failed := bh.importer.GetStats()
	job.Progress.Imported = imported
	job.Progress.Failed = failed
	job.Progress.TotalProcessed = imported + failed
}

func (bh *BatchHandler) GetImportProgress(c *gin.Context) {
	jobID := c.Param("jobId")
	
	job, exists := bh.jobs[jobID]
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Job not found"})
		return
	}

	select {
	case progress := <-job.ProgressChan:
		job.Progress.TotalProcessed = progress.TotalProcessed
		job.Progress.Imported = progress.Imported
		job.Progress.Failed = progress.Failed
		job.Progress.CurrentGame = progress.CurrentGame
		job.Progress.LastUpdate = progress.Timestamp
	default:
	}

	c.JSON(http.StatusOK, job.Progress)
}

func (bh *BatchHandler) CancelImport(c *gin.Context) {
	jobID := c.Param("jobId")
	
	job, exists := bh.jobs[jobID]
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Job not found"})
		return
	}

	if job.Status == "running" {
		job.CancelFunc()
		job.Status = "cancelled"
		job.Progress.Status = "cancelled"
		job.Progress.LastUpdate = time.Now()
	}

	c.JSON(http.StatusOK, gin.H{
		"job_id": jobID,
		"status": "cancelled",
	})
}

func (bh *BatchHandler) StreamImport(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")

	jobID := generateJobID()
	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	var req struct {
		PGN string `json:"pgn" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	pgnTexts := strings.Split(req.PGN, "\n\n\n")
	progressChan := make(chan database.ImportProgress, 10)

	pgnChannel := make(chan string, 50)
	go func() {
		defer close(pgnChannel)
		for _, pgn := range pgnTexts {
			if strings.TrimSpace(pgn) != "" {
				select {
				case pgnChannel <- pgn:
				case <-ctx.Done():
					return
				}
			}
		}
	}()

	gameChannel := bh.parser.StreamParsePGN(pgnChannel)

	go func() {
		bh.importer.ImportWithChannels(ctx, gameChannel, progressChan)
		close(progressChan)
	}()

	c.Stream(func(w io.Writer) bool {
		select {
		case progress, ok := <-progressChan:
			if !ok {
				imported, failed := bh.importer.GetStats()
				finalProgress := map[string]interface{}{
					"job_id":          jobID,
					"status":          "completed",
					"total_processed": imported + failed,
					"imported":        imported,
					"failed":          failed,
					"timestamp":       time.Now(),
				}
				data, _ := json.Marshal(finalProgress)
				c.SSEvent("progress", string(data))
				return false
			}

			progressData := map[string]interface{}{
				"job_id":          jobID,
				"status":          "running",
				"total_processed": progress.TotalProcessed,
				"imported":        progress.Imported,
				"failed":          progress.Failed,
				"current_game":    progress.CurrentGame,
				"timestamp":       progress.Timestamp,
			}
			data, _ := json.Marshal(progressData)
			c.SSEvent("progress", string(data))
			return true

		case <-ctx.Done():
			return false
		}
	})
}

func generateJobID() string {
	return strconv.FormatInt(time.Now().UnixNano(), 36)
}