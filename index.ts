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
      <meta charset="UTF-8"><title>Face Recognition</title>
      <style>
        body { font-family: sans-serif; background-color: #1a1a1a; color: #f0f0f0; margin: 0; padding: 20px; }
        h1, h2 { text-align: center; }
        .container { max-width: 1200px; margin: 0 auto; }
        .section { margin-bottom: 40px; padding: 20px; border: 2px solid #555; border-radius: 10px; background-color: #2b2b2b; }
        .detections-container { display: flex; flex-wrap: wrap; gap: 15px; justify-content: center; }
        .detection { text-align: center; }
        img { display: block; border: 2px solid #444; border-radius: 4px; width: 150px; height: 150px; object-fit: contain; }
        form { display: flex; flex-direction: column; align-items: center; gap: 15px; }
        #query-results { margin-top: 20px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div id="query-section" class="section">
          <h2>Query by Image</h2>
          <form id="query-form">
            <input type="file" id="query-image" accept="image/*" required>
            <button type="submit">Find Matches</button>
          </form>
          <div id="query-results"></div>
        </div>
        <div class="section">
          <h2>Indexed Persons</h2>`;
  
  for (const personId in groupedByPerson) {
    htmlContent += `
      <div class="person-gallery">
        <h2 class="person-header">Person ID: ${personId}</h2>
        <div class="detections-container">`;
    
    for (const det of groupedByPerson[personId]) {
      const img = await canvas.loadImage(det.path);
      // Create a standard-size canvas
      const faceCanvas = canvas.createCanvas(150, 150);
      const faceCtx = faceCanvas.getContext('2d');
      // Fill background for letterboxing
      faceCtx.fillStyle = '#222';
      faceCtx.fillRect(0, 0, 150, 150);
      
      // Calculate new dimensions to fit 150x150 while maintaining aspect ratio
      const aspectRatio = det.box_width / det.box_height;
      let newWidth = 150, newHeight = 150;
      if (aspectRatio > 1) { // Wider than tall
        newHeight = 150 / aspectRatio;
      } else { // Taller than wide
        newWidth = 150 * aspectRatio;
      }
      const xOffset = (150 - newWidth) / 2;
      const yOffset = (150 - newHeight) / 2;

      faceCtx.drawImage(img, det.box_x, det.box_y, det.box_width, det.box_height, xOffset, yOffset, newWidth, newHeight);
      const dataUrl = faceCanvas.toDataURL('image/jpeg');
      htmlContent += `<div class="detection"><img src="${dataUrl}" alt="Detection from ${det.path}" /></div>`;
    }
    htmlContent += `</div></div>`;
  }

  htmlContent += `
        </div>
      </div>
      <script>
        const queryForm = document.getElementById('query-form');
        const queryImageInput = document.getElementById('query-image');
        const queryResults = document.getElementById('query-results');

        queryForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!queryImageInput.files || queryImageInput.files.length === 0) {
            queryResults.innerHTML = 'Please select an image file first.';
            return;
          }
          queryResults.innerHTML = 'Processing...';

          const formData = new FormData();
          formData.append('queryImage', queryImageInput.files[0]);

          try {
            const res = await fetch('/upload', {
              method: 'POST',
              body: formData,
            });
            const data = await res.json();
            displayResults(data);
          } catch (error) {
            console.error('Error during fetch:', error);
            queryResults.innerHTML = 'An error occurred. See console for details.';
          }
        });
        
        async function displayResults(data) {
          queryResults.innerHTML = \`<h3>\${data.message}</h3>\`;
          if (!data.matches || data.matches.length === 0) return;

          const container = document.createElement('div');
          container.className = 'detections-container';
          queryResults.appendChild(container);
          
          for (const match of data.matches) {
            // Since we don't have access to the original full images on the client,
            // we will just show the path for now. A more advanced solution would
            // be to serve the cropped images from the server.
            const p = document.createElement('p');
            p.textContent = \`Found in: \${match.path}\`;
            container.appendChild(p);
          }
        }
      </script>
    </body></html>`;
  fs.writeFileSync('indexed_faces.html', htmlContent);
  console.log('HTML report generated: indexed_faces.html');
}

indexImages();
