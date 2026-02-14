package services

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// IsSupportedExtension checks if an extension is indexable.
func IsSupportedExtension(ext string) bool {
	return supportedExtensions[ext]
}

// DetectFileType returns image, video, or unknown.
func DetectFileType(ext string) string {
	if imageExtensions[ext] {
		return "image"
	}
	if videoExtensions[ext] {
		return "video"
	}
	return "unknown"
}

// SanitizeUploadFolderName validates a folder name and blocks path traversal.
func SanitizeUploadFolderName(name string) (string, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return "", fmt.Errorf("folder name is required")
	}
	if strings.Contains(trimmed, "..") || strings.ContainsAny(trimmed, "/\\") {
		return "", fmt.Errorf("folder name cannot include path separators")
	}
	return trimmed, nil
}

// UniqueFilePath creates a unique file path in a directory if the name exists.
func UniqueFilePath(dir, filename string) (string, error) {
	safeName := filepath.Base(filename)
	if safeName == "." || safeName == string(filepath.Separator) || safeName == "" {
		return "", fmt.Errorf("invalid file name")
	}

	ext := filepath.Ext(safeName)
	base := strings.TrimSuffix(safeName, ext)
	candidate := filepath.Join(dir, safeName)
	for i := 1; ; i++ {
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate, nil
		} else if err != nil {
			return "", err
		}
		candidate = filepath.Join(dir, fmt.Sprintf("%s-%d%s", base, i, ext))
	}
}
