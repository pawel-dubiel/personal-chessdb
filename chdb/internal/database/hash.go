package database

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

func HashPosition(fen string) string {
	parts := strings.Split(fen, " ")
	if len(parts) < 2 {
		return hashString(fen)
	}
	
	positionPart := parts[0] + " " + parts[1]
	return hashString(positionPart)
}

func HashPattern(pattern string) string {
	return hashString(pattern)
}

func hashString(s string) string {
	hash := sha256.Sum256([]byte(s))
	return hex.EncodeToString(hash[:])
}