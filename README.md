# Face Recognition Desktop MVP

This project is a simple offline face recognition system built as a self-contained desktop application using Electron, Node.js, and TypeScript.

It allows you to build a local, private database of faces by indexing a folder of your images. You can then provide a new photo to find all known appearances of a specific person from your indexed collection.

## Features

- **Local & Private:** All face detection, recognition, and data storage happens entirely on your machine. Nothing is ever uploaded to the cloud.
- **Persistent Database:** Uses SQLite to store face data in your user application data directory, separate from the application's source code.
- **Interactive UI:** Select folders to index and images to query using native file dialogs.
- **Cross-Platform:** Can be run in development and built for distribution on both macOS and Windows.

## Technologies Used

- **Electron:** For creating the cross-platform desktop application shell.
- **@vladmandic/face-api:** A powerful, community-maintained library for face detection and recognition in Node.js.
- **TypeScript:** For robust, type-safe code.
- **better-sqlite3:** For fast, local database storage.
- **electron-builder:** For packaging the application into distributable `.dmg` and `.exe` installers.

## Prerequisites

- Node.js (v18 or higher recommended)
- pnpm (or your preferred package manager like npm or yarn)

## How to Use

### Development Mode

To run the application directly from the source code in a development environment:

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd face-detect-mvp
    ```

2.  **Install dependencies:** This command will also automatically rebuild the native modules required by Electron.
    ```bash
    pnpm install
    ```

3.  **Start the application:**
    ```bash
    pnpm start
    ```
    This will compile the TypeScript code and launch the Electron application.

### Building Distributable Packages

You can package the application into a distributable installer for macOS or Windows. The output files will be located in the `release/` directory.

- **To build for macOS:**
  ```bash
  pnpm dist:mac
  ```

- **To build for Windows:**
  ```bash
  pnpm dist:win
  ```

Once built, you can share the resulting `.dmg` (Mac) or `.exe` (Windows) file with other users.
