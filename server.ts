import express from 'express';
import * as path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import * as canvas from 'canvas';
import * as faceapi from '@vladmandic/face-api';
import db from './database';

// --- SETUP ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = 3000;
const upload = multer({ storage: multer.memoryStorage() }); // Use memory storage

// Monkey patch the environment
const { Canvas, Image, ImageData } = canvas as any;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

// --- LOAD MODELS ON STARTUP ---
Promise.all([
  faceapi.nets.ssdMobilenetv1.loadFromDisk('./models'),
  faceapi.nets.faceLandmark68Net.loadFromDisk('./models'),
  faceapi.nets.faceRecognitionNet.loadFromDisk('./models')
]).then(() => {
  console.log('Face-api models loaded successfully.');
  app.listen(port, () => {
    console.log(`Server running! Open http://localhost:${port}/indexed_faces.html`);
  });
});

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use('/models', express.static(path.join(__dirname, 'models')));

// --- API Endpoint for Image Upload and Query ---
app.post('/upload', upload.single('queryImage'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded.' });
  }

  try {
    // --- 1. Detect face in the uploaded image ---
    const img = await canvas.loadImage(req.file.buffer);
    const result = await faceapi.detectSingleFace(img as any).withFaceLandmarks().withFaceDescriptor();

    if (!result) {
      return res.json({ matches: [], message: 'Could not detect a face in the uploaded image.' });
    }

    // --- 2. Find matches in the database ---
    const allFaces = db.prepare('SELECT id, descriptor FROM persons').all() as { id: number; descriptor: string }[];
    if (!allFaces.length) {
      return res.json({ matches: [], message: 'No faces found in the database.' });
    }

    const labeledDescriptors = allFaces.map(face => new faceapi.LabeledFaceDescriptors(face.id.toString(), [new Float32Array(JSON.parse(face.descriptor))]));
    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors);
    const bestMatch = faceMatcher.findBestMatch(result.descriptor);

    if (bestMatch.label === 'unknown' || bestMatch.distance > 0.55) {
      return res.json({ matches: [], message: 'No confident match found in the database.' });
    }

    // --- 3. Return all detections for the matched person ---
    const personId = parseInt(bestMatch.label);
    const detections = db.prepare(`
      SELECT i.path, d.box_x, d.box_y, d.box_width, d.box_height 
      FROM detections d 
      JOIN images i ON d.image_id = i.id 
      WHERE d.person_id = ?
    `).all(personId);

    res.json({ matches: detections, message: `Found match for Person ID: ${personId}` });

  } catch (error) {
    console.error('Error processing upload:', error);
    res.status(500).json({ error: 'Server error during face processing.' });
  }
}); 