package server

import (
	"github.com/gin-gonic/gin"
	"github.com/chdb/chessdb/internal/database"
)

func SetupRouter(db *database.DB) *gin.Engine {
	router := gin.Default()
	handler := NewHandler(db)

	router.Use(gin.Recovery())
	router.Use(corsMiddleware())

	api := router.Group("/api/v1")
	{
		api.GET("/health", handler.HealthCheck)
		api.GET("/stats", handler.GetStats)

		games := api.Group("/games")
		{
			games.POST("/import", handler.ImportGames)
			games.POST("/import/file", handler.ImportFile)
			games.GET("/search", handler.SearchGames)
			games.POST("/search/pattern", handler.SearchByPattern)
			games.GET("/:id", handler.GetGame)
			games.DELETE("/:id", handler.DeleteGame)
		}
	}

	return router
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}