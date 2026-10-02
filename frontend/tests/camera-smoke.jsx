import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CameraView from '../src/components/CameraView.jsx';
import '../src/index.css';

if (!import.meta.env.DEV) throw new Error('Diagnostic is development only.');

const devices = navigator.mediaDevices;
const originalGetUserMedia = Object.getOwnPropertyDescriptor(devices, 'getUserMedia');
const originalEnumerateDevices = Object.getOwnPropertyDescriptor(devices, 'enumerateDevices');
const canvas = document.createElement('canvas');
canvas.width = 1280;
canvas.height = 720;
const context = canvas.getContext('2d');
const paint = () => {
  context.fillStyle = '#111827';
  context.fillRect(0, 0, canvas.width, canvas.height);
};
paint();
const paintTimer = setInterval(paint, 50);
const streams = [];
const pending = [];
let requests = 0;
const diagnostic = document.querySelector('#diagnostic');
const update = () => {
  const allTracks = streams.flatMap(stream => stream.getTracks());
  const live = allTracks.filter(track => track.readyState === 'live').length;
  diagnostic.textContent = `Requests: ${requests}; pending: ${pending.length}; acquired streams: ${streams.length}; live tracks: ${live}; ended tracks: ${allTracks.length - live}`;
  document.querySelector('#track-details').textContent = allTracks.map((track, index) => `Track ${index + 1}: ${track.readyState}`).join(' · ') || 'No acquired tracks';
};
const acquire = () => {
  const stream = canvas.captureStream(20);
  streams.push(stream);
  update();
  return stream;
};
Object.defineProperty(devices, 'getUserMedia', { configurable: true, value: () => {
  requests++;
  const mode = document.querySelector('#mode').value;
  update();
  if (mode === 'pending') return new Promise((resolve, reject) => { pending.push({ resolve, reject }); update(); });
  const failure = { denied: 'NotAllowedError', 'no-device': 'NotFoundError', busy: 'NotReadableError' }[mode];
  return failure ? Promise.reject(new DOMException('Simulated diagnostic camera failure', failure)) : Promise.resolve(acquire());
} });
Object.defineProperty(devices, 'enumerateDevices', { configurable: true, value: async () => [
  { kind: 'videoinput', deviceId: 'synthetic', label: 'Synthetic blank video' },
] });
document.querySelector('#resolve').onclick = () => {
  const request = pending.shift();
  if (request) request.resolve(acquire());
  update();
};
document.querySelector('#end').onclick = () => {
  for (const stream of streams) for (const track of stream.getTracks()) {
    if (track.readyState !== 'live') continue;
    track.stop();
    track.dispatchEvent(new Event('ended'));
  }
  update();
};
const root = createRoot(document.querySelector('#root'));
const mount = () => {
  root.render(<StrictMode><CameraView /></StrictMode>);
  document.querySelector('#mount-status').textContent = 'CameraView mounted';
};
document.querySelector('#unmount').onclick = () => {
  root.render(null);
  document.querySelector('#mount-status').textContent = 'CameraView unmounted';
};
document.querySelector('#remount').onclick = mount;
const monitor = setInterval(update, 200);
mount();
window.addEventListener('pagehide', () => {
  root.unmount();
  clearInterval(paintTimer);
  clearInterval(monitor);
  for (const stream of streams) stream.getTracks().forEach(track => track.stop());
  for (const request of pending.splice(0)) request.reject(new DOMException('Diagnostic closed', 'AbortError'));
  if (originalGetUserMedia) Object.defineProperty(devices, 'getUserMedia', originalGetUserMedia);
  else delete devices.getUserMedia;
  if (originalEnumerateDevices) Object.defineProperty(devices, 'enumerateDevices', originalEnumerateDevices);
  else delete devices.enumerateDevices;
});
