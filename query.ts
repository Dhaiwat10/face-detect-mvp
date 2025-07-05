import * as fs from 'fs';
import * as path from 'path';
import * as canvas from 'canvas';
import * as faceapi from '@vladmandic/face-api';
import db from './database';

// --- SETUP ---
const { Canvas, Image, ImageData } = canvas as any;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

async function queryByImage(queryImagePath: string) {
  if (!fs.existsSync(queryImagePath)) {
    console.error('Error: Query image not found at path:', queryImagePath);
    return;
  }
  
  console.log('Loading models...');
  await faceapi.nets.ssdMobilenetv1.loadFromDisk('./models');
  await faceapi.nets.faceLandmark68Net.loadFromDisk('./models');
  await faceapi.nets.faceRecognitionNet.loadFromDisk('./models');

  // --- LOAD ALL FACES FROM DATABASE ---
  console.log('Loading known faces from database...');
  const allFaces = db.prepare('SELECT id, descriptor FROM faces').all();
  if (!allFaces.length) {
    console.log('No faces found in the database. Please run the indexing script first.');
    return;
  }
  
  const labeledFaceDescriptors = allFaces.map((face: any) => {
    const descriptor = new Float32Array(JSON.parse(face.descriptor));
    return new faceapi.LabeledFaceDescriptors(face.id.toString(), [descriptor]);
  });
  const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors);
  
  // --- PROCESS QUERY IMAGE ---
  console.log(`Processing query image: ${queryImagePath}`);
  const img = await canvas.loadImage(queryImagePath);
  const results = await faceapi
    .detectAllFaces(img as any)
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (!results.length) {
    console.log('No faces detected in the query image.');
    return;
  }

  // --- FIND AND DISPLAY MATCHES ---
  console.log('\n--- Query Results ---');
  for (const result of results) {
    const bestMatch = faceMatcher.findBestMatch(result.descriptor);
    console.log(`\nDetected face in query image. Best match in DB is Face ID: ${bestMatch.label} (Distance: ${bestMatch.distance.toFixed(2)})`);

    if (bestMatch.label !== 'unknown') {
      const matchedFaceId = parseInt(bestMatch.label);
      const imageRecords = db.prepare('SELECT path FROM images WHERE id = (SELECT image_id FROM faces WHERE id = ?)')
        .all(matchedFaceId) as { path: string }[];
      
      console.log(`  > This person was also found in the following images:`);
      imageRecords.forEach(record => {
        console.log(`    - ${record.path}`);
      });
    } else {
      console.log('  > This person is not in our database.');
    }
  }
}

// --- RUN SCRIPT ---
const queryImage = process.argv[2];
if (!queryImage) {
  console.log('Please provide a path to an image to query.');
  console.log('Example: pnpm query ./images/some_new_photo.jpg');
} else {
  queryByImage(queryImage);
} 