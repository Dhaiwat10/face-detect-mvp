import * as fs from 'fs';
import * as canvas from 'canvas';
import * as faceapi from '@vladmandic/face-api';

// Monkey patch the environment to use canvas
const { Canvas, Image, ImageData } = canvas as any;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

async function main() {
  // Load the SSD Mobilenet V1 model
  await faceapi.nets.ssdMobilenetv1.loadFromDisk('./models');

  // Load the image
  const img = await canvas.loadImage('./images/test3.jpg');
  
  // Create a canvas and draw the image on it
  const tempCanvas = canvas.createCanvas(img.width, img.height);
  const ctx = tempCanvas.getContext('2d');
  ctx.drawImage(img, 0, 0, img.width, img.height);
  
  // Set detection options
  const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });

  // Detect all faces in the image
  const detections = await faceapi.detectAllFaces(tempCanvas as any, options);
  console.log('Number of faces detected:', detections.length);

  // Draw boxes around the detected faces
  if (detections.length > 0) {
    console.log('Drawing boxes...');
    faceapi.draw.drawDetections(tempCanvas as any, detections);
  }

  // Save the result to a new file
  const out = fs.createWriteStream('./images/test_detected.jpg');
  const stream = tempCanvas.createJPEGStream();
  stream.pipe(out);
  out.on('finish', () => console.log('Saved image with detected faces as test_detected.jpg'));
}

main();
