# MediaPipe Tasks catalog (checked at 0.10.32)

Canonical docs: `https://ai.google.dev/edge/mediapipe/solutions/guide`.
Repo: `https://github.com/google-ai-edge/mediapipe` (Python sources under `mediapipe/tasks/python/` at tag `v0.10.32`).
Model Maker: `https://ai.google.dev/edge/mediapipe/solutions/model_maker`.
Studio playground: `https://mediapipe-studio.webapps.google.com/`.

Python task classes live under `mediapipe.tasks.python.<domain>` (`vision`, `audio`, `text`); `mediapipe.tasks.python.BaseOptions` holds `model_asset_path`, `model_asset_buffer` and `delegate` (`BaseOptions.Delegate.CPU | GPU`; GPU Ubuntu-only). Web classes come from `@mediapipe/tasks-vision` and take `baseOptions: { modelAssetPath, modelAssetBuffer, delegate: 'CPU' | 'GPU' }`.

Run modes: vision `RunningMode.IMAGE | VIDEO | LIVE_STREAM`; audio `RunningMode.AUDIO_CLIPS | AUDIO_STREAM`. Text tasks have no running mode.

## Vision tasks

| Task | Doc path | Python class (0.10.32) | Web class (0.10.32) | Main result fields (Python) |
|---|---|---|---|---|
| Object Detector | `/solutions/vision/object_detector/` | `ObjectDetector` | `ObjectDetector` | `detections[]` (bounding_box, categories) |
| Image Classifier | `/solutions/vision/image_classifier/` | `ImageClassifier` | `ImageClassifier` | `classifications[].categories[]` |
| Image Segmenter | `/solutions/vision/image_segmenter/` | `ImageSegmenter` | `ImageSegmenter` | `confidence_masks[]`, `category_mask` |
| Interactive Segmenter | `/solutions/vision/interactive_segmenter/` | `InteractiveSegmenter` (+ `InteractiveSegmenterRegionOfInterest`) | `InteractiveSegmenter` | same as Image Segmenter |
| Gesture Recognizer | `/solutions/vision/gesture_recognizer/` | `GestureRecognizer` | `GestureRecognizer` | `gestures`, `handedness`, `hand_landmarks`, `hand_world_landmarks` |
| Hand Landmarker | `/solutions/vision/hand_landmarker/` | `HandLandmarker` | `HandLandmarker` | `hand_landmarks` (21/hand), `hand_world_landmarks`, `handedness` |
| Face Detector | `/solutions/vision/face_detector/` | `FaceDetector` | `FaceDetector` | `detections` with bbox and 6 keypoints |
| Face Landmarker | `/solutions/vision/face_landmarker/` | `FaceLandmarker` | `FaceLandmarker` | `face_landmarks` (478), `face_blendshapes`, `facial_transformation_matrixes` |
| Pose Landmarker | `/solutions/vision/pose_landmarker/` | `PoseLandmarker` | `PoseLandmarker` | `pose_landmarks` (33), `pose_world_landmarks`, `segmentation_masks` |
| Holistic Landmarker | `/solutions/vision/holistic_landmarker/` | not in 0.10.32 Python | `HolisticLandmarker` | face + hands + pose |
| Image Embedder | `/solutions/vision/image_embedder/` | `ImageEmbedder` | `ImageEmbedder` | `embeddings[]` (length is model dependent) |
| Face Stylizer | `/solutions/vision/face_stylizer/` | not in 0.10.32 Python | not in 0.10.32 web | — |
| Image Generator | `/solutions/vision/image_generator/` | not in 0.10.32 Python | not in 0.10.32 web | Android only |

### Non-obvious options

- `PoseLandmarkerOptions`: `num_poses` (1), `min_pose_detection_confidence` (0.5), `min_pose_presence_confidence` (0.5), `min_tracking_confidence` (0.5), `output_segmentation_masks` (False). Web adds `canvas` for the GPU/worker path.
- `HandLandmarkerOptions`: `num_hands` (1), `min_hand_detection_confidence`, `min_hand_presence_confidence`, `min_tracking_confidence`.
- `FaceLandmarkerOptions`: `num_faces` (1), `min_face_detection_confidence`, `min_face_presence_confidence`, `min_tracking_confidence`, `output_face_blendshapes`, `output_facial_transformation_matrixes`.
- `ImageSegmenterOptions`: `output_confidence_masks` (True), `output_category_mask` (False).
- `ObjectDetectorOptions`: `max_results`, `score_threshold`, `category_allowlist`, `category_denylist`.
- `GestureRecognizerOptions`: `num_hands`, `canned_gesture_classifier_options`, `custom_gesture_classifier_options`.

## Pose landmark indices (33)

0 nose; 1–3 left eye inner/eye/outer; 4–6 right eye inner/eye/outer; 7 left ear; 8 right ear; 9 mouth left; 10 mouth right; 11 left shoulder; 12 right shoulder; 13 left elbow; 14 right elbow; 15 left wrist; 16 right wrist; 17 left pinky; 18 right pinky; 19 left index; 20 right index; 21 left thumb; 22 right thumb; 23 left hip; 24 right hip; 25 left knee; 26 right knee; 27 left ankle; 28 right ankle; 29 left heel; 30 right heel; 31 left foot index; 32 right foot index. Python exposes these as `vision.PoseLandmark`. Left/right are the person's anatomical sides on the unmirrored image.

## Audio tasks

| Task | Doc path | Class | Input | Output |
|---|---|---|---|---|
| Audio Classifier | `/solutions/audio/audio_classifier/` | `AudioClassifier` | `AudioData` from `mediapipe.tasks.python.components.containers.audio_data` (`AudioData.create_from_array(float32_samples, sample_rate)`) | list of results, one per window, with `timestamp_ms` and `classifications[].categories[]` |

YAMNet has 521 AudioSet classes. `audio.AudioData` is not exported by the audio module at 0.10.32.

## Text tasks

| Task | Doc path | Class | Output |
|---|---|---|---|
| Text Classifier | `/solutions/text/text_classifier/` | `TextClassifier` | `classifications[].categories[]` |
| Text Embedder | `/solutions/text/text_embedder/` | `TextEmbedder` | `embeddings[]` |
| Language Detector | `/solutions/text/language_detector/` | `LanguageDetector` | `detections[]` with `language_code`, `probability` |

## GenAI

- LLM Inference API: Android, iOS and Web; Google's docs mark it maintenance-only and recommend LiteRT-LM. No Python inference API.
- Python `mediapipe.tasks.python.genai` at 0.10.32 contains `bundler` and `converter` (model preparation tools) only.

## Landmark shapes

```
NormalizedLandmark (pose_landmarks, hand_landmarks, face_landmarks):
  x, y: float      # fraction of input image width/height; can be slightly outside 0..1
  z: float         # relative depth, not metric
  visibility: float | None   # model score, not a correctness probability
  presence:   float | None

Landmark (pose_world_landmarks, hand_world_landmarks):
  x, y, z: float   # metres; pose origin is near the centre of the hips
```

## Platforms

- Python: `mediapipe` on PyPI (Tasks only at 0.10.32).
- Web: `@mediapipe/tasks-vision` (also `tasks-audio`, `tasks-text`, `tasks-genai`) on npm.
- Android: `com.google.mediapipe:tasks-vision`.
- iOS: `MediaPipeTasksVision`.
