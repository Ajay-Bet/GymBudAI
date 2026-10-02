/* global importScripts */
// Classic worker: MediaPipe's WASM loader uses importScripts internally.
let landmarker;
let closing = false;

self.onmessage = async ({ data }) => {
  if (data.type === 'close') {
    closing = true;
    landmarker?.close();
    landmarker = null;
    self.postMessage({ type: 'closed' });
    self.close();
    return;
  }
  try {
    if (data.type === 'init') {
      importScripts(data.bundlePath);
      const { FilesetResolver, PoseLandmarker } = self.vision;
      const fileset = await FilesetResolver.forVisionTasks(data.wasmPath);
      const model = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: data.modelPath, delegate: 'CPU' },
        canvas: new OffscreenCanvas(1, 1),
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
      if (closing) model.close();
      else {
        landmarker = model;
        self.postMessage({ type: 'ready' });
      }
    } else if (data.type === 'frame') {
      try {
        if (!landmarker || closing) return;
        const began = performance.now();
        const result = landmarker.detectForVideo(data.bitmap, data.timestampMs);
        self.postMessage({
          type: 'result',
          timestampMs: data.timestampMs,
          sourceWidth: data.sourceWidth,
          sourceHeight: data.sourceHeight,
          landmarks: result.landmarks[0] || [],
          worldLandmarks: result.worldLandmarks[0] || [],
          inferenceMs: performance.now() - began,
        });
      } finally {
        data.bitmap.close();
      }
    }
  } catch (error) {
    landmarker?.close();
    landmarker = null;
    self.postMessage({ type: 'error', message: `Pose model: ${error.message || 'initialization or detection failed'}` });
  }
};
