import { createPoseEngine } from '../src/vision/PoseEngine.js';

if (!import.meta.env.DEV) throw new Error('Diagnostic is development only.');
const preview = document.querySelector('#video');
const status = document.querySelector('#status');
const results = document.querySelector('#results');
const tracks = document.querySelector('#tracks');
let engine;
let stream;
let timer;
let frame;
let session = 0;
function stop() {
  session++;
  clearInterval(timer);
  cancelAnimationFrame(frame);
  engine?.close();
  engine = null;
  stream?.getTracks().forEach(track => track.stop());
  tracks.textContent = `Tracks: ${stream ? stream.getTracks().map(track => track.readyState).join(', ') : 'none'}`;
  stream = null;
  preview.pause();
  preview.srcObject = null;
  status.textContent = 'Stopped; worker closed and synthetic tracks released';
}
document.querySelector('#stop').onclick = stop;
document.querySelector('#start').onclick = async () => {
  stop();
  const currentSession = session;
  let count = 0;
  results.textContent = 'Results: 0';
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext('2d');
  const paint = () => { context.fillStyle = '#111827'; context.fillRect(0, 0, 640, 360); };
  paint();
  stream = canvas.captureStream(20);
  tracks.textContent = `Tracks: ${stream.getTracks().map(track => track.readyState).join(', ')}`;
  timer = setInterval(paint, 50);
  preview.srcObject = stream;
  engine = createPoseEngine({
    onStatus: value => { status.textContent = value.message; },
    onError: error => { stop(); status.textContent = `Error: ${error.message}`; },
    onResult: result => { count++; results.textContent = `Results: ${count}; landmarks: ${result.landmarks.length}; inference: ${Math.round(result.inferenceMs)} ms; worker: ${result.mode}`; },
  });
  try {
    await preview.play();
    await engine.start();
    if (currentSession !== session) return;
    const tick = () => { engine.process(preview, performance.now()); frame = requestAnimationFrame(tick); };
    tick();
  } catch (error) {
    if (currentSession === session) { stop(); status.textContent = `Error: ${error.message}`; }
  }
};
window.addEventListener('pagehide', stop);
