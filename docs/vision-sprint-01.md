# Sprint 1 camera and pose guide

## Run and review

From `frontend`, run `npm ci`, then `npm run dev`. Open the homepage on localhost and scroll below the footer to **Try GymBud on your webcam**. FastAPI and a database are not needed for camera tracking.

`predev` and `prebuild` prepare the same-origin vision assets automatically. First setup requires internet access to download the public model. Run `npm run vision:assets` directly to repair missing assets. Later starts reuse the checksum-verified local model. The generated `public/vision` directory is ignored by Git and copied into production builds by Vite.

## Versions and data boundary

- Package and matching WASM runtime: `@mediapipe/tasks-vision` **0.10.32**, pinned in `package.json` and the lockfile.
- Model: Google's Pose Landmarker Lite, **float16/1**.
- Model source: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`.
- SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`.
- Runtime and model are served under `/vision/`. The generated manifest records the model source and checksum. The setup script wraps the package's CommonJS bundle for a classic worker; this retains `importScripts`, which the WASM loader needs.
- Camera frames and pose observations stay in temporary browser memory. There is no upload, recording, dataset collection, backend request or workout save in this feature. Stop and navigation discard the session. GCP remains the future storage platform.

## How the parts connect

1. `CameraView` provides controls and status inside the existing homepage.
2. `CameraManager` requests one video stream without audio and owns its cleanup, including streams returned after cancellation.
3. The video element previews that stream. Each new video frame is offered to `PoseEngine`.
4. The engine skips work while a previous frame is outstanding. It creates a bitmap no wider than 640 pixels, keeping the original aspect ratio, and transfers it to a worker.
5. `pose.worker` runs MediaPipe in VIDEO mode and returns the first person's landmarks and inference duration. It releases each bitmap after use.
6. The tracking validator checks the selected anatomical side. Canvas draws reliable joints and connections over the uncropped video. Missing or old results clear the overlay.

Google's [Pose Landmarker web guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js) explains that detection is synchronous; GymBud therefore runs it in a worker. There is no unmeasured main-thread fallback. A browser without the required worker, ImageBitmap, OffscreenCanvas or WebGL support displays a failure with browser guidance.

## Observation contract for Sprint 2

This is a JavaScript contract; the existing JSX UI is retained for this sprint. TypeScript remains the target project stack.

`createPoseEngine({ onResult, onError, onStatus })` returns `start()`, `process(video, timestampMs)` and `close()`. Create one engine per active session; closed engines cannot restart.

Each result has `timestampMs`, `landmarks`, `worldLandmarks`, `sourceWidth`, `sourceHeight`, `inferenceMs` and `mode: 'worker'`. Source dimensions are the original camera frame in pixels, not the resized bitmap; retain these for future aspect-correct geometry. Timestamps use the page's monotonic `performance.now()` clock in milliseconds, not UTC; the same timestamp identifies the captured input and its result. Results older than 500 ms are discarded. Empty landmark arrays mean no person detected.

The 33 image landmarks use original unmirrored camera coordinates: x increases rightward, y downward, normalized independently by image width and height. The model's z is relative depth, not a physical distance. World landmarks are raw model estimates in meters and are not validated measurements for this sprint. Anatomical landmark indices never change when the preview is mirrored. Future 2D geometry must account for image aspect ratio.

Only finite, in-frame x/y with visibility at least 0.5 and presence at least 0.5 when supplied are drawn. These configurable engineering thresholds are not calibrated correctness probabilities. Required indices are left shoulder/elbow/wrist/hip **11/13/15/23**, or right **12/14/16/24**. All four must remain reliable for 300 ms before tracking becomes active. A missing required point yields partial tracking; no pose yields lost tracking. Gaps over 500 ms, stale timestamps and side changes reset stabilization. This is positioning guidance, not form assessment or calibration.

Suggested initial view: one person, camera around torso height, selected arm facing the camera, shoulder through hip and the whole arm in frame. This view and the reference device remain proposals pending physical review. Multiple people and mobile-browser certification are outside Sprint 1.

## Browser acceptance checklist

1. Allow camera access. Confirm model loading, live video and tracking status. Show your selected shoulder, elbow, wrist and hip until tracking becomes active.
2. Click Stop and Start repeatedly. Confirm the camera indicator turns off, the skeleton clears, and restart works. While permission is pending, click Stop, then allow access: the late stream must be released and stay off.
3. Deny permission, then restore permission using browser site controls and retry. Check actionable text for no camera, a busy camera and unplugging an external camera where available.
4. Leave the frame, cover the selected arm and return. Expect lost/partial guidance and a fresh skeleton without a page reload.
5. Resize the window; toggle mirroring. Confirm joints remain on the matching body parts and anatomical arm selection remains unchanged.
6. Navigate to another route during capture and during a pending permission request. Confirm capture ends. Return and start a new session.
7. On the agreed reference device, run for five minutes. Record browser/OS/device, capture FPS, analyzed FPS, inference latency, responsive controls and recovery. The proposed target is at least 15 analyzed FPS; automated synthetic tests cannot establish this target or real pose quality.
8. Inspect the Network panel during tracking: runtime/model downloads are expected; camera/pose uploads and frame-by-frame API requests are not.

Run `npm test`, `npm run lint` and `npm run build` for repeatable checks. Consult the sprint record for exactly which checks were performed and which remain manual.

## Development diagnostics

While Vite is running, `/tests/vision-smoke.html` exercises the real worker on generated blank video. `/tests/camera-smoke.html` mounts the real CameraView under React StrictMode and substitutes camera permission outcomes and generated streams on that isolated test page. Its controls simulate success, pending permission, denial, missing/busy camera, track interruption and component unmount/remount. Counts show whether acquired tracks remain live. Neither diagnostic requests a physical webcam. These development-only pages are excluded from the normal production build and cannot validate human pose accuracy.

The frontend GitHub Actions workflow runs install, tests, lint and build. A saved workflow is not evidence of a remote CI run; check the sprint record before claiming CI completion.
