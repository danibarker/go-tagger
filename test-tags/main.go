package main

import (
	"fmt"
	"os"

	"github.com/barasher/go-exiftool"
)

var Et *exiftool.Exiftool

func initExifTool() {
	var err error
	const bufferSize = 100 * 1024 * 1024
	buffer := make([]byte, bufferSize)
	Et, err = exiftool.NewExiftool(exiftool.Buffer(buffer, bufferSize))
	if err != nil {
		panic(err)
	}
	fmt.Println("ExifTool initialized with stay_open optimization.")
}

func readMetadata(filePath string) {
	if Et == nil {
		fmt.Println("ExifTool is not initialized.")
		return
	}
	results := Et.ExtractMetadata(filePath)
	if len(results) == 0 || results[0].Err != nil {
		fmt.Printf("Error reading metadata: %v\n", results[0].Err)
		return
	}
	data := results[0].Fields
	tags := readStringList(data, "Subject", "XMP:Subject", "XMP-dc:Subject")
	people := readStringList(data, "PersonInImage", "XMP:PersonInImage", "XMP-iptcExt:PersonInImage")

	fmt.Printf("Tags: %v\n", tags)
	fmt.Printf("People: %v\n", people)
}

func readStringList(data map[string]interface{}, keys ...string) []string {
	seen := make(map[string]struct{})
	var results []string

	add := func(value string) {
		if value == "" {
			return
		}
		if _, exists := seen[value]; exists {
			return
		}
		seen[value] = struct{}{}
		results = append(results, value)
	}

	for _, key := range keys {
		raw, ok := data[key]
		if !ok {
			continue
		}
		switch v := raw.(type) {
		case string:
			add(v)
		case []interface{}:
			for _, item := range v {
				if strItem, ok := item.(string); ok {
					add(strItem)
				}
			}
		default:
			fmt.Printf("Unexpected type for key %s: %T\n", key, raw)
		}
	}

	return results
}

func main() {
	initExifTool()
	defer Et.Close()
	// read command line argument for file paths
	if len(os.Args) < 2 {
		fmt.Println("Please provide a file path as an argument.")
		return
	}
	for _, filePath := range os.Args[1:] {
		fmt.Printf("Reading metadata for: %s\n", filePath)
		readMetadata(filePath)
	}

}
