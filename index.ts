import * as fs from 'fs';
import * as path from 'path';
import * as canvas from 'canvas';
import * as faceapi from '@vladmandic/face-api';
import db, { setupDatabase } from './database';

// --- DATABASE AND MODEL SETUP ---
const { Canvas, Image, ImageData } = canvas as any;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
setupDatabase();

// --- Main Indexing Function ---
async function indexImages() {
  console.log('Loading models...');
  await faceapi.nets.ssdMobilenetv1.loadFromDisk('./models');
  await faceapi.nets.faceLandmark68Net.loadFromDisk('./models');
  await faceapi.nets.faceRecognitionNet.loadFromDisk('./models');
  
  // --- LOAD EXISTING FACES FROM DB ---
  console.log('Loading known faces from database...');
  const knownFaces = db.prepare('SELECT id, descriptor FROM persons').all() as { id: number; descriptor: string }[];
  const labeledFaceDescriptors = knownFaces.map(face => {
    const descriptor = new Float32Array(JSON.parse(face.descriptor));
    return new faceapi.LabeledFaceDescriptors(face.id.toString(), [descriptor]);
  });
  
  // Initialize FaceMatcher only if there are known faces, otherwise it starts empty
  let faceMatcher: faceapi.FaceMatcher | null = labeledFaceDescriptors.length > 0 ? new faceapi.FaceMatcher(labeledFaceDescriptors) : null;

  // --- PREPARE DATABASE STATEMENTS ---
  const insertImageStmt = db.prepare('INSERT OR IGNORE INTO images (path) VALUES (?)');
  const insertPersonStmt = db.prepare('INSERT INTO persons (descriptor) VALUES (?)');
  const insertDetectionStmt = db.prepare('INSERT INTO detections (person_id, image_id, box_x, box_y, box_width, box_height) VALUES (?, ?, ?, ?, ?, ?)');
  const selectImageStmt = db.prepare('SELECT id FROM images WHERE path = ?');

  // --- PROCESS EACH IMAGE ---
  const imagesDir = './images';
  const imageFiles = fs.readdirSync(imagesDir).filter(file => file.endsWith('.jpg') || file.endsWith('.png'));
  const detectionOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });

  for (const imageFile of imageFiles) {
    const imagePath = path.join(imagesDir, imageFile);
    console.log(`\nProcessing ${imagePath}...`);

    // Check if image is already indexed to avoid re-processing detections
    const existingImage = selectImageStmt.get(imagePath);
    if (existingImage) {
      console.log('Image already indexed. Skipping.');
      continue;
    }
    
    // Process new image
    const img = await canvas.loadImage(imagePath);
    const results = await faceapi.detectAllFaces(img as any, detectionOptions).withFaceLandmarks().withFaceDescriptors();
    
    if (!results.length) {
      console.log('No faces found.');
      continue;
    }

    // Get imageId for the new image
    const imageId = insertImageStmt.run(imagePath).lastInsertRowid;

    for (const result of results) {
      // If faceMatcher is null, we simulate a "no match" result
      const bestMatch = faceMatcher ? faceMatcher.findBestMatch(result.descriptor) : { label: 'unknown', distance: 1.0 };
      let personId: number | bigint;

      if (bestMatch.label !== 'unknown' && bestMatch.distance < 0.55) { // Confidence threshold
        console.log(`Match found for existing Person ID: ${bestMatch.label}`);
        personId = parseInt(bestMatch.label);
      } else {
        // New person found
        const descriptor = JSON.stringify(Array.from(result.descriptor));
        const newPerson = insertPersonStmt.run(descriptor);
        personId = newPerson.lastInsertRowid;
        console.log(`New person found. Assigned Person ID: ${personId}`);
        // Add new person to our list and create/update the matcher
        labeledFaceDescriptors.push(new faceapi.LabeledFaceDescriptors(personId.toString(), [result.descriptor]));
        faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors);
      }
      
      const { x, y, width, height } = result.detection.box;
      insertDetectionStmt.run(personId, imageId, x, y, width, height);
    }
    console.log(`Indexed ${results.length} detections for ${imagePath}.`);
  }

  console.log('\nImage indexing complete.');
  await generateHtmlReport();
}

async function generateHtmlReport() {
  console.log('Generating HTML report...');
  
  const allDetections = db.prepare(`
    SELECT p.id as personId, i.path, d.box_x, d.box_y, d.box_width, d.box_height 
    FROM detections d
    JOIN persons p ON d.person_id = p.id
    JOIN images i ON d.image_id = i.id
    ORDER BY p.id
  `).all() as { personId: number; path: string; box_x: number; box_y: number; box_width: number; box_height: number; }[];

  const groupedByPerson: { [key: number]: any[] } = {};
  allDetections.forEach(det => {
    if (!groupedByPerson[det.personId]) {
      groupedByPerson[det.personId] = [];
    }
    groupedByPerson[det.personId].push(det);
  });

  let htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8"><title>Indexed Faces</title>
      <style>
        body { font-family: sans-serif; background-color: #1a1a1a; color: #f0f0f0; margin: 0; padding: 20px; }
        h1 { text-align: center; }
        .person-gallery { margin-bottom: 40px; padding: 20px; border: 2px solid #555; border-radius: 10px; background-color: #2b2b2b; }
        .person-header { font-size: 1.5em; margin-bottom: 20px; }
        .detections-container { display: flex; flex-wrap: wrap; gap: 15px; }
        .detection { text-align: center; }
        img { display: block; border: 2px solid #444; border-radius: 4px; }
      </style>
    </head>
    <body><h1>Indexed Persons</h1>`;
  
  for (const personId in groupedByPerson) {
    htmlContent += `
      <div class="person-gallery">
        <h2 class="person-header">Person ID: ${personId}</h2>
        <div class="detections-container">`;
    
    for (const det of groupedByPerson[personId]) {
      const img = await canvas.loadImage(det.path);
      const faceCanvas = canvas.createCanvas(det.box_width, det.box_height);
      faceCanvas.getContext('2d').drawImage(img, det.box_x, det.box_y, det.box_width, det.box_height, 0, 0, det.box_width, det.box_height);
      const dataUrl = faceCanvas.toDataURL('image/jpeg');
      htmlContent += `<div class="detection"><img src="${dataUrl}" alt="Detection from ${det.path}" /></div>`;
    }
    htmlContent += `</div></div>`;
  }

  htmlContent += `</body></html>`;
  fs.writeFileSync('indexed_faces.html', htmlContent);
  console.log('HTML report generated: indexed_faces.html');
}

indexImages();
