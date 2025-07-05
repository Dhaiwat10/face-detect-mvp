# Offline Face Recognition Library

This project is a simple offline face recognition system built with Node.js, TypeScript, and `face-api.js`. It allows you to index a collection of photos and then query the system with a new photo to find out where a specific person has appeared.

## Features

- **Face Indexing:** Scans a directory of images and creates a searchable database of all unique faces.
- **Face Querying:** Accepts an image upload and finds all known occurrences of the person in that image.
- **Web Interface:** A simple, clean web page to view indexed faces and perform queries.
- **Offline First:** All processing is done locally without relying on any cloud services.
- **SQLite Backend:** Uses a local SQLite database to store face data persistently.

## How It Works

The system is composed of two main scripts:

1.  **`index.ts` (The Indexer):** This script scans all images in the `/images` directory. For each image, it detects all faces. It then compares each face to the ones already stored in the database. If a face is new, it's added as a new "person." A "detection" record is then created to link that person to the specific image and location where they were found. It also generates an HTML report (`indexed_faces.html`) to visualize the database.

2.  **`server.ts` (The Application Server):** This script runs an Express.js web server that serves the `indexed_faces.html` page and provides a backend API. When you upload an image through the web interface, the server processes the image, detects the face, and queries the database to find all matching detections for that person.

## Prerequisites

- Node.js (v18 or higher recommended)
- pnpm (or your preferred package manager like npm or yarn)

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd face-detect-mvp
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

3.  **Add images:** Place all the images you want to index into the `/images` directory. The script supports `.jpg` and `.png` files.

## Usage

The application has a two-step workflow: first you index your images, then you run the server to query them.

### Step 1: Index Your Images

Run the indexing script. This will populate your `faces.db` database with all the faces found in your `/images` folder and generate the `indexed_faces.html` web interface.

```bash
pnpm index
```

You should run this command whenever you add new images to the `/images` directory.

### Step 2: Run the Web Server

Start the application server, which will allow you to interact with your indexed face library.

```bash
pnpm server
```

The server will start and provide you with a URL.

### Step 3: Use the Web Application

1.  Open your web browser and navigate to the URL provided by the server (usually `http://localhost:3000/indexed_faces.html`).
2.  You will see a gallery of all unique persons that have been indexed.
3.  In the "Query by Image" section, use the "Choose File" button to select an image from your computer that contains a person you want to find.
4.  Click the "Find Matches" button.
5.  The page will update to show you a list of all the images in your database where that person has been found.
