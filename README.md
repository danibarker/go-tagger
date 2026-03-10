# go-tagger

## What This Project Does
This project appears to be a system for tagging images, likely using a client-server architecture. The `go-tagger-client` component likely handles image processing and tagging, while the `go-tagger-server` component manages the tagging data and potentially provides an API. The `index.html` suggests a web interface for interaction.

## Tech Stack
*   **Language:** Go (primarily in `go-tagger-server`), JavaScript (primarily in `go-tagger-client`)
*   **Frameworks/Libraries:**  None explicitly identified beyond standard npm packages.
*   **Tools:** npm, Go, Git

## Project Structure
*   `go-tagger-client`:  Contains JavaScript code for the client-side application, likely responsible for image processing and user interface.
*   `go-tagger-server`: Contains Go code for the server-side application, potentially handling tagging logic and data storage.
*   `index.html`:  A basic HTML file, likely serving as the entry point for the client-side application.
*   `package.json`:  npm package manifest defining scripts for building and running the client.
*   `package-lock.json`: npm lock file ensuring consistent dependency versions.
*   `pnpm-lock.yaml`: pnpm lock file ensuring consistent dependency versions.
*   `test-tags`:  Likely contains test data or files related to tagging.
*   `.git`, `.gitignore`: Standard Git repository files.

## Getting Started
The `package.json` defines several npm scripts:
*   `npm install`:  Installs dependencies for both client and server.
*   `npm run build`: Builds the client application.
*   `npm run install-server`: Installs Go dependencies for the server.
*   `npm run install-client`: Installs npm dependencies for the client.
*   `npm run build-client`: Builds the client application.
*   `npm run build-server`: Builds the Go server application.
*   `sudo systemctl restart photos.service`:  A systemd command to restart a service named "photos.service" (likely related to the tagging process).

## Status
Incomplete - The project lacks a clear build process beyond the provided scripts and the server appears to be a Go project, but the functionality is not defined.

## Notes
The project utilizes both npm and Go. The `photos.service` suggests a systemd integration. The project's purpose is unclear beyond the provided scripts.
