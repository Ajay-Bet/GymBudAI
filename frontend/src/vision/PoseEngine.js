const MAX_FRAME_AGE_MS = 500;
const FRAME_TIMEOUT_MS = 10000;

/**
 * Pose results use unmirrored normalized image coordinates. sourceWidth and
 * sourceHeight describe the original video frame, not the resized bitmap;
 * future 2D geometry must account for this source aspect ratio.
 * @typedef {Object} PoseResult
 * @property {number} timestampMs Monotonic performance-clock capture timestamp.
 * @property {number} sourceWidth Original video width in pixels.
 * @property {number} sourceHeight Original video height in pixels.
 * @property {Array} landmarks Normalized image landmarks, or an empty array.
 * @property {Array} worldLandmarks Model world coordinates in meters.
 * @property {number} inferenceMs Worker inference duration in milliseconds.
 * @property {'worker'} mode Processing location.
 */

// A session owns a worker and at most one bitmap (including bitmap creation).
export function createPoseEngine({ onResult, onError, onStatus } = {}) {
  let worker;
  let closed = false;
  let ready = false;
  let busy = false;
  let lastVideoTime = -1;
  let lastTimestamp = -1;
  let pendingTimestamp = null;
  let initPromise;
  let rejectStart;
  let initTimer;
  let frameTimer;

  function close() {
    if (closed) return;
    closed = true;
    ready = false;
    clearTimeout(initTimer);
    clearTimeout(frameTimer);
    rejectStart?.(new DOMException('Pose session stopped.', 'AbortError'));
    rejectStart = null;
    if (worker) {
      const retiringWorker = worker;
      // Give an idle worker time to close its MediaPipe graph. Termination also
      // releases its WASM memory if loading/inference is currently blocked.
      const terminateTimer = setTimeout(() => retiringWorker.terminate(), 150);
      retiringWorker.onmessage = ({ data }) => {
        if (data.type === 'closed') {
          clearTimeout(terminateTimer);
          retiringWorker.terminate();
        }
      };
      retiringWorker.onerror = null;
      retiringWorker.postMessage({ type: 'close' });
      worker = null;
    }
  }

  function fail(error) {
    if (closed) return;
    rejectStart?.(error);
    rejectStart = null;
    close();
    onError?.(error);
  }

  function start() {
    if (initPromise) return initPromise;
    initPromise = new Promise((resolve, reject) => {
      rejectStart = reject;
      if (closed) {
        reject(new DOMException('Pose session stopped.', 'AbortError'));
        return;
      }
      if (typeof Worker === 'undefined' || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
        fail(new Error('Pose tracking needs Web Workers, ImageBitmap and OffscreenCanvas. Try a current Chrome or Edge browser.'));
        return;
      }
      try {
        worker = new Worker(new URL('./pose.worker.js', import.meta.url));
        worker.onerror = () => fail(new Error('Pose worker failed. Check the local model/runtime assets and try again.'));
        worker.onmessage = ({ data }) => {
          if (closed) return;
          if (data.type === 'ready') {
            clearTimeout(initTimer);
            rejectStart = null;
            ready = true;
            onStatus?.({ state: 'ready', message: 'Pose model ready.', mode: 'worker' });
            resolve();
          } else if (data.type === 'error') {
            fail(new Error(data.message || 'Pose detection failed.'));
          } else if (data.type === 'result' && data.timestampMs === pendingTimestamp) {
            clearTimeout(frameTimer);
            busy = false;
            pendingTimestamp = null;
            // Never paint an old skeleton over a newer live frame.
            if (performance.now() - data.timestampMs <= MAX_FRAME_AGE_MS) {
              onResult?.({ ...data, mode: 'worker' });
            } else {
              onStatus?.({ state: 'stale', message: 'Tracking delayed. Waiting for a fresh frame.', mode: 'worker' });
            }
          }
        };
        onStatus?.({ state: 'loading', message: 'Loading pose model…', mode: 'worker' });
        const assetRoot = new URL(`${import.meta.env?.BASE_URL || '/'}vision/`, globalThis.location.href);
        worker.postMessage({
          type: 'init',
          bundlePath: new URL('vision_bundle.js', assetRoot).href,
          wasmPath: new URL('wasm', assetRoot).href,
          modelPath: new URL('pose_landmarker_lite.task', assetRoot).href,
        });
        initTimer = setTimeout(() => fail(new Error('Pose model loading timed out. Check the assets and restart.')), 60000);
      } catch (error) {
        fail(error);
      }
    });
    return initPromise;
  }

  function process(video, timestampMs) {
    if (closed || !ready || busy || video.readyState < 2 || !video.videoWidth || !video.videoHeight
      || video.currentTime === lastVideoTime || !Number.isFinite(timestampMs) || timestampMs <= lastTimestamp) return;
    busy = true;
    lastVideoTime = video.currentTime;
    lastTimestamp = timestampMs;
    pendingTimestamp = timestampMs;
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    const width = Math.min(640, sourceWidth);
    const height = Math.max(1, Math.round(sourceHeight * width / sourceWidth));
    frameTimer = setTimeout(() => fail(new Error('Pose processing stalled. Stop and restart to try again.')), FRAME_TIMEOUT_MS);
    Promise.resolve().then(() => createImageBitmap(video, { resizeWidth: width, resizeHeight: height }))
      .then((bitmap) => {
        if (closed || performance.now() - timestampMs > MAX_FRAME_AGE_MS) {
          bitmap.close();
          busy = false;
          clearTimeout(frameTimer);
          return;
        }
        try {
          worker.postMessage({ type: 'frame', bitmap, timestampMs, sourceWidth, sourceHeight }, [bitmap]);
        } catch (error) {
          bitmap.close();
          throw error;
        }
      }).catch(fail);
  }

  return { start, process, close };
}
