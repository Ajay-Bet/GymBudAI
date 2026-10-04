---
name: cv-mediapipe
description: |
  Google MediaPipe Tasks API reference, checked against the version GymBud pins (0.10.32 for both the web package @mediapipe/tasks-vision and the Python wheel). Covers Vision Tasks (Pose, Hand and Face Landmarker, Face Detector, Gesture Recognizer, Object Detector, Image Classifier/Embedder, Image and Interactive Segmenter), Audio Classifier and Text Tasks; run modes IMAGE, VIDEO, LIVE_STREAM; .task model bundles; result shapes and common errors. Use when writing or reviewing code that calls MediaPipe, choosing a task or model, or debugging landmark output. For how MediaPipe is wired into GymBud (worker, assets, offline extraction, upgrades), use the mediapipe-workflow skill.
argument-hint: "[task]"
metadata:
  mcpmarket-version: 1.0.0
  gymbud-verified-against: "mediapipe 0.10.32 (PyPI) and @mediapipe/tasks-vision 0.10.32 (npm), 2026-10-04"
---
# cv-mediapipe

**Context:** $ARGUMENTS

Imported from the `cv-mediapipe` 1.0.0 skill and corrected for the MediaPipe version GymBud pins. The corrections are listed at the end under "GymBud verification notes". For GymBud's own MediaPipe wiring, read the `mediapipe-workflow` skill first.

Every MediaPipe Task has the same shape: base options (model path, delegate) → task options → create from options → `detect` / `detectForVideo` / `detect_async` / `classify` / `segment` / `recognize` / `embed`. Docs home: `https://ai.google.dev/edge/mediapipe/solutions/guide`. Source: `https://github.com/google-ai-edge/mediapipe`.

## Which MediaPipe? (Python)

| API | Status at 0.10.32 | Import |
|---|---|---|
| `mediapipe.solutions.*` (legacy) | **Not shipped in the wheel.** The 0.10.32 `setup.py` packages only `mediapipe` and `mediapipe.tasks.*`, so `import mediapipe.solutions` fails. | — |
| Tasks API | Current | `import mediapipe as mp` then `mp.tasks.vision`, or `from mediapipe.tasks.python import vision` |

The 0.10.32 Python Tasks are a ctypes wrapper over the C library (`libmediapipe.so`). Top-level `mediapipe` exposes `tasks`, `Image` and `ImageFormat` only.

## Which MediaPipe? (web)

GymBud's live loop is in the browser, using `@mediapipe/tasks-vision` (npm). Same task concepts, camelCase names: `FilesetResolver.forVisionTasks(wasmPath)` → `PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath, delegate: 'CPU' | 'GPU' }, runningMode: 'VIDEO', numPoses: 1 })` → `detectForVideo(frame, timestampMs)` → `close()`. Web 0.10.32 exports: DrawingUtils, FaceDetector, FaceLandmarker, FilesetResolver, GestureRecognizer, HandLandmarker, HolisticLandmarker, ImageClassifier, ImageEmbedder, ImageSegmenter, InteractiveSegmenter, MPImage, MPMask, ObjectDetector, PoseLandmarker.

## When to use

- Fast pre-trained landmark, detection, segmentation and classification models on CPU, without PyTorch or TensorFlow.
- Browser, Android, iOS and desktop Python targets.
- Pair with OpenCV or PyAV for video I/O in Python; MediaPipe returns landmarks, OpenCV draws or saves.

For custom ONNX models use another runtime. Use MediaPipe only when a pre-trained Task fits.

## Step 1 — Install

Python (match the repo pin; see `ml/requirements-extraction.txt`):

```bash
pip install 'mediapipe==0.10.32' numpy opencv-python
```

Or `uv run scripts/mp.py ...`, whose PEP 723 header pins the same version. Use the upstream `mediapipe` wheel, not community forks.

Web: `npm install @mediapipe/tasks-vision@0.10.32` (exact pin). The WASM files in the package must match the JS bundle version.

## Step 2 — Get the model (`.task` / `.tflite`)

Landmarkers and the gesture recognizer load a `.task` bundle (a zip of models plus metadata). Detectors, classifiers and segmenters load a `.tflite` with metadata. Canonical files are listed on each task page under `ai.google.dev/edge/mediapipe/solutions/vision/<task>/#models`, hosted under `https://storage.googleapis.com/mediapipe-models/<task>/<model>/<precision>/<version>/<file>`.

| Task | File |
|---|---|
| Face Detector | `blaze_face_short_range.tflite` |
| Face Landmarker | `face_landmarker.task` |
| Hand Landmarker | `hand_landmarker.task` |
| Pose Landmarker | `pose_landmarker_lite.task` (or `_full`, `_heavy`) |
| Gesture Recognizer | `gesture_recognizer.task` |
| Object Detector | `efficientdet_lite0.tflite` |
| Image Classifier | `efficientnet_lite0.tflite` |
| Image Segmenter | `selfie_segmenter.tflite` |
| Audio Classifier | `yamnet.tflite` |
| Text Classifier | `bert_classifier.tflite` |

Pin the exact URL (precision and version segment) and a SHA-256, as GymBud does for Pose Landmarker Lite `float16/1`. Full catalog in [`references/tasks.md`](references/tasks.md).

## Step 3 — Generic Vision Task pattern (Python)

```python
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

base = python.BaseOptions(model_asset_path="pose_landmarker_lite.task")
opts = vision.PoseLandmarkerOptions(
    base_options=base,
    running_mode=vision.RunningMode.VIDEO,  # IMAGE | VIDEO | LIVE_STREAM
    num_poses=1,
)
with vision.PoseLandmarker.create_from_options(opts) as landmarker:
    image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_uint8)
    result = landmarker.detect_for_video(image, timestamp_ms)
    # result.pose_landmarks: List[List[NormalizedLandmark]]
    # result.pose_world_landmarks: List[List[Landmark]]
```

### Run modes

- `IMAGE`: one frame, synchronous `detect(image)`.
- `VIDEO`: decoded frames, synchronous `detect_for_video(image, timestamp_ms)` (web: `detectForVideo`). Timestamps must increase monotonically across calls.
- `LIVE_STREAM`: `detect_async(image, timestamp_ms)` with a required `result_callback` (web: `resultListener`). Return fast from the callback.

The bundled `scripts/mp.py` supports `--mode image|video` only; it has no live mode.

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/mp.py pose-landmark \
  --model pose_landmarker_lite.task --input video.mp4 --mode video --out-json pose.json
```

### Output shapes (Python field names at 0.10.32)

- `PoseLandmarkerResult`: `pose_landmarks` (33 normalized per person), `pose_world_landmarks` (metres, origin near the hip centre), optional `segmentation_masks`. Web: `landmarks`, `worldLandmarks`.
- `HandLandmarkerResult`: `hand_landmarks` (21 per hand), `hand_world_landmarks`, `handedness`.
- `FaceLandmarkerResult`: `face_landmarks` (478), optional `face_blendshapes` (52), optional `facial_transformation_matrixes`.
- `ObjectDetectorResult` / `FaceDetectorResult`: `detections` with bounding box and categories (face: 6 keypoints).
- `ImageSegmenter`: `confidence_masks` (on by default) and/or `category_mask` (off by default).
- `GestureRecognizerResult`: `gestures`, `handedness`, `hand_landmarks`, `hand_world_landmarks`. Canned labels: None, Closed_Fist, Open_Palm, Pointing_Up, Thumb_Down, Thumb_Up, Victory, ILoveYou.
- `ImageClassifier` / `ImageEmbedder`: top-k categories / embedding vector (length depends on the model).
- `AudioClassifier`: one result per window (YAMNet: 521 classes).
- Text tasks: classification, embedding, or language code + probability.

## Step 4 — On-device LLMs (not for GymBud)

The MediaPipe LLM Inference API exists for Android, iOS and Web only and Google's docs say it is now in maintenance-only mode, recommending LiteRT-LM. The Python package has no inference module (`mediapipe.tasks.python.genai` contains only `bundler` and `converter`). GymBud's coaching wording goes through the FastAPI coaching proxy, not on-device LLMs.

## Step 5 — Model Maker (transfer learning)

`pip install mediapipe-model-maker` supports Object Detector, Image Classifier, Gesture Recognizer, Text Classifier and Face Stylizer customization. Docs: `https://ai.google.dev/edge/mediapipe/solutions/model_maker`. Not used by GymBud; its ML pilot trains a portable classifier on pose features instead (see `ml/README.md`).

## Interactive testing

MediaPipe Studio (`https://mediapipe-studio.webapps.google.com/`) runs each task in the browser. Useful for a quick look at a model; not evidence for GymBud acceptance.

## Gotchas

- **No `mediapipe.solutions` in 0.10.32.** Old tutorials using `mp.solutions.pose` will fail on import.
- **Python input is `mp.Image`.** Wrap RGB uint8 data with `mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)`. OpenCV gives BGR: convert with `cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)` first.
- **Timestamps must strictly increase** in VIDEO and LIVE_STREAM modes. Prefer real presentation or capture timestamps over `frame_index * 1000 / fps`, and skip a frame rather than reuse a timestamp.
- **LIVE_STREAM requires a result callback**; creating the task without one raises.
- **Normalized landmarks are 0–1 of the input image** (values can fall slightly outside when a joint is off-frame). Multiply by the source width and height for pixels, and correct aspect ratio before measuring 2D angles. `z` is relative depth, not metric.
- **`visibility` and `presence` are model scores, not correctness probabilities.** A missing value means not observed; do not substitute 0 or treat it as good form.
- **Default counts:** `num_poses` 1, `num_hands` 1, `num_faces` 1. Raise them explicitly.
- **Image Segmenter defaults:** `output_confidence_masks=True`, `output_category_mask=False`. Turn on only what you read.
- **Python GPU delegate:** the 0.10.32 source says GPU support "is currently limited to Ubuntu platforms". Use CPU on macOS. Web supports `delegate: 'GPU'` where WebGL is available; GymBud uses CPU in its worker.
- **Close tasks.** Python: use `with ... as task:` or `task.close()`. Web: call `close()`; close each `MPImage`/`MPMask` you keep.
- **Web detection is synchronous** on the calling thread. Run it in a worker to keep the UI responsive.
- **The `.task` file is a zip.** `unzip -l foo.task` lists its contents; an HTML error page or truncated download fails to load. Verify a checksum.

## Troubleshooting

- `ModuleNotFoundError: mediapipe.solutions` / `AttributeError: module 'mediapipe' has no attribute 'solutions'`: legacy API is not in 0.10.32. Port to the Tasks API.
- `ImportError: cannot import name 'tasks'`: wheel older than 0.10. Install the pinned version.
- Timestamp error in VIDEO / LIVE_STREAM: a timestamp repeated or went backwards. Track the previous value and skip non-increasing frames.
- `z` looks meaningless: use `pose_world_landmarks` / `hand_world_landmarks` for metric 3D, and only where their stability has been evaluated.
- Model fails to load: wrong path (use absolute paths) or corrupt download (re-download, compare SHA-256).

## GymBud verification notes (2026-10-04)

Checked against the v0.10.32 tag of `google-ai-edge/mediapipe`, the installed `@mediapipe/tasks-vision` 0.10.32 typings and the official task docs. Corrections to the imported 1.0.0 text:

1. Legacy `mediapipe.solutions` is not "deprecated but importable"; the 0.10.32 wheel does not ship it.
2. Python LLM inference (`mediapipe.tasks.python.genai.inference`) does not exist; LLM Inference is Android/iOS/Web and in maintenance mode. The `llm` CLI subcommand was removed.
3. Python vision at 0.10.32 has no Face Stylizer, Holistic Landmarker or Image Generator. Holistic exists on web.
4. Default `num_hands` is 1, not 2.
5. Result field names are `pose_world_landmarks` / `hand_world_landmarks`, not `world_landmarks`.
6. Python GPU delegate is Ubuntu-only per the source docstring, not "any GPU build".
7. Image Segmenter: confidence masks are on by default and the category mask off.
8. `mp.py`: the audio command used `audio.AudioData`, which the audio module does not export (now imports from `components.containers.audio_data`); 8-bit and 32-bit WAV normalization was wrong; the "interactive" segment type actually ran the plain segmenter (removed); missing visibility/presence was written as 0.0 (now null); version pinned to 0.10.32.
9. Embedding sizes and the `mediapipe[genai]` extra were unverified or nonexistent and were removed.

## Reference docs

- [`references/tasks.md`](references/tasks.md): full task catalog with options, result fields and platform availability at 0.10.32.
