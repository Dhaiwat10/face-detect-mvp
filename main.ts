import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import * as canvas from 'canvas';
import * as faceapi from '@vladmandic/face-api';
import getDb, { initializeDatabase, setupDatabase } from './database.js';

// --- ELECTRON APP SETUP ---
let mainWindow: BrowserWindow | null;
const isDev = !app.isPackaged;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Monkey patch the environment
const { Canvas, Image, ImageData } = canvas as any;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1200,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173'); // Vite dev server
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the compiled index.html
    const htmlPath = path.join(__dirname, '../index.html');
    mainWindow.loadFile(htmlPath);
  }
}

app.disableHardwareAcceleration(); // To fix rasterization errors on some systems

app.whenReady().then(async () => {
  const userDataPath = app.getPath('userData');
  const db = initializeDatabase(userDataPath);
  setupDatabase(db); // Note: This clears the DB on every start. Consider changing this behavior.

  const modelsPath = isDev ? path.join(__dirname, '../models') : path.join(__dirname, 'models');
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath);
  console.log('Models loaded.');
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC HANDLERS (BACKEND LOGIC) ---

ipcMain.handle('index-folder', async () => {
  if (!mainWindow) return;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (canceled || filePaths.length === 0) return;
  const folderPath = filePaths[0];
  console.log(`Starting indexing for folder: ${folderPath}`);

  // --- Start of ported indexing logic from index.ts ---
  mainWindow.webContents.send('update-results', 'Indexing started...');

  const db = getDb();
  const knownFaces = db.prepare('SELECT id, descriptor FROM persons').all() as { id: number; descriptor: string }[];
  const labeledFaceDescriptors = knownFaces.map(face => {
    const descriptor = new Float32Array(JSON.parse(face.descriptor));
    return new faceapi.LabeledFaceDescriptors(face.id.toString(), [descriptor]);
  });
  let faceMatcher: faceapi.FaceMatcher | null = labeledFaceDescriptors.length > 0 ? new faceapi.FaceMatcher(labeledFaceDescriptors) : null;
  
  const insertImageStmt = db.prepare('INSERT OR IGNORE INTO images (path) VALUES (?)');
  const insertPersonStmt = db.prepare('INSERT INTO persons (descriptor) VALUES (?)');
  const insertDetectionStmt = db.prepare('INSERT INTO detections (person_id, image_id, box_x, box_y, box_width, box_height) VALUES (?, ?, ?, ?, ?, ?)');
  const selectImageStmt = db.prepare('SELECT id FROM images WHERE path = ?');
  
  const imageFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.jpeg'));
  const detectionOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });

  for (const imageFile of imageFiles) {
    const imagePath = path.join(folderPath, imageFile);
    mainWindow.webContents.send('update-results', `Processing ${imagePath}...`);
    
    const existingImage = selectImageStmt.get(imagePath);
    if (existingImage) {
      console.log(`Image ${imagePath} already indexed. Skipping.`);
      continue;
    }
    
    const img = await canvas.loadImage(imagePath);
    const results = await faceapi.detectAllFaces(img as any, detectionOptions).withFaceLandmarks().withFaceDescriptors();
    
    if (!results.length) continue;

    const imageId = insertImageStmt.run(imagePath).lastInsertRowid;
    for (const result of results) {
      const bestMatch = faceMatcher ? faceMatcher.findBestMatch(result.descriptor) : { label: 'unknown', distance: 1.0 };
      let personId: number | bigint;
      if (bestMatch.label !== 'unknown' && bestMatch.distance < 0.55) {
        personId = parseInt(bestMatch.label);
      } else {
        const descriptor = JSON.stringify(Array.from(result.descriptor));
        const newPerson = insertPersonStmt.run(descriptor);
        personId = newPerson.lastInsertRowid;
        labeledFaceDescriptors.push(new faceapi.LabeledFaceDescriptors(personId.toString(), [result.descriptor]));
        faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors);
      }
      const { x, y, width, height } = result.detection.box;
      insertDetectionStmt.run(personId, imageId, x, y, width, height);
    }
    console.log(`Indexed ${results.length} faces from ${imagePath}`);
  }
  // --- End of ported indexing logic ---

  mainWindow.webContents.send('update-results', 'Indexing complete. Refreshing gallery...');
  const galleryHtml = await generateGalleryHtml();
  mainWindow.webContents.send('update-gallery', galleryHtml);
  mainWindow.webContents.send('update-results', 'Done.');
});

ipcMain.handle('query-by-image', async () => {
  if (!mainWindow) return;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg'] }]
  });
  if (canceled || filePaths.length === 0) return;
  const queryImagePath = filePaths[0];
  mainWindow.webContents.send('update-results', `Querying with ${path.basename(queryImagePath)}...`);

  // --- Start of ported querying logic ---
  const db = getDb();
  const knownFaces = db.prepare('SELECT id, descriptor FROM persons').all() as { id: number; descriptor: string }[];
  if (knownFaces.length === 0) {
    mainWindow.webContents.send('update-results', 'No faces indexed yet. Please index a folder first.');
    return;
  }
  
  const labeledFaceDescriptors = knownFaces.map(face => {
      const descriptor = new Float32Array(JSON.parse(face.descriptor));
      return new faceapi.LabeledFaceDescriptors(face.id.toString(), [descriptor]);
  });
  const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors);

  const img = await canvas.loadImage(queryImagePath);
  const detectionOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });
  const results = await faceapi.detectAllFaces(img as any, detectionOptions).withFaceLandmarks().withFaceDescriptors();

  if (!results.length) {
    mainWindow.webContents.send('update-results', 'No faces could be detected in the query image.');
    return;
  }
  
  let resultsHtml = '';
  const foundPersons = new Map<number, { path: string }[]>();

  for (const result of results) {
    const bestMatch = faceMatcher.findBestMatch(result.descriptor);
    if (bestMatch.label === 'unknown' || bestMatch.distance > 0.55) {
      continue; // Skip unknown faces
    }
    
    const personId = parseInt(bestMatch.label);
    if (foundPersons.has(personId)) {
        continue; // Already processed this person
    }

    const matchedDetections = db.prepare(`
      SELECT i.path
      FROM detections d
      JOIN images i ON d.image_id = i.id
      WHERE d.person_id = ?
    `).all(personId) as { path: string }[];
    foundPersons.set(personId, matchedDetections);
  }

  if (foundPersons.size === 0) {
    resultsHtml = `<h3>No known persons found in the query image.</h3>`;
  } else {
    for (const [personId, detections] of foundPersons.entries()) {
      resultsHtml += `
        <div class="person-gallery">
          <h2 class="person-header">Found Person ID: ${personId}</h2>
          <p>This person also appears in the following images:</p>
          <div class="detections-container">`;
      for (const det of detections) {
          const dataUrl = await fs.promises.readFile(det.path, 'base64');
          resultsHtml += `<div class="detection"><img src="data:image/jpeg;base64,${dataUrl}" alt="Match in ${det.path}" /><p>${path.basename(det.path)}</p></div>`;
      }
      resultsHtml += `</div></div>`;
    }
  }
  
  // --- End of ported querying logic ---

  mainWindow.webContents.send('update-results', resultsHtml);
});

// --- HTML GENERATION (Adapted from index.ts) ---
async function generateGalleryHtml() {
  console.log('Generating gallery HTML...');
  const db = getDb();
  const allDetections = db.prepare(`
    SELECT p.id as personId, i.path, d.box_x, d.box_y, d.box_width, d.box_height 
    FROM detections d
    JOIN persons p ON d.person_id = p.id
    JOIN images i ON d.image_id = i.id
    ORDER BY p.id
  `).all() as { personId: number; path: string; box_x: number; box_y: number; box_width: number; box_height: number; }[];

  const groupedByPerson: { [key: number]: any[] } = {};
  allDetections.forEach(det => {
    if (!groupedByPerson[det.personId]) groupedByPerson[det.personId] = [];
    groupedByPerson[det.personId].push(det);
  });

  let htmlContent = '';
  for (const personId in groupedByPerson) {
    htmlContent += `
      <div class="person-gallery">
        <h2 class="person-header">Person ID: ${personId}</h2>
        <div class="detections-container">`;
    for (const det of groupedByPerson[personId]) {
      const img = await canvas.loadImage(det.path);
      const faceCanvas = canvas.createCanvas(150, 150);
      const faceCtx = faceCanvas.getContext('2d');
      faceCtx.fillStyle = '#222';
      faceCtx.fillRect(0, 0, 150, 150);
      const aspectRatio = det.box_width / det.box_height;
      let newWidth = 150, newHeight = 150;
      if (aspectRatio > 1) { newHeight = 150 / aspectRatio; } else { newWidth = 150 * aspectRatio; }
      const xOffset = (150 - newWidth) / 2;
      const yOffset = (150 - newHeight) / 2;
      faceCtx.drawImage(img, det.box_x, det.box_y, det.box_width, det.box_height, xOffset, yOffset, newWidth, newHeight);
      const dataUrl = faceCanvas.toDataURL('image/jpeg');
      htmlContent += `<div class="detection"><img src="${dataUrl}" alt="Detection from ${det.path}" /></div>`;
    }
    htmlContent += `</div></div>`;
  }
  return htmlContent || '<h2>No persons indexed yet.</h2>';
} 