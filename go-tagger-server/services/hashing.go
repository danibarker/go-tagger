package services

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
)

// CalculateSHA256Hash opens the file and returns its SHA-256 hash as a hex string.
func CalculateSHA256Hash(filePath string) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	hash := sha256.New()

	// Copy the file content into the hash object
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}

	// Get the final hash sum and convert it to a human-readable string
	return hex.EncodeToString(hash.Sum(nil)), nil
}
