---
name: s1-camera-ui
description: "Sprint 1 camera/UI specialist: CameraView.jsx and vision/CameraManager.js lifecycle, controls, overlay, status and timing UI."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

Role (copied word for word from `docs/sprints/sprint-01.md`, "Agent assignments"):

- Camera/UI specialist: CameraView.jsx and vision/CameraManager.js; lifecycle, controls, overlay surface, status and timing UI.

Shared contract for this sprint (copied word for word from the same section):

- Engine interface: createPoseEngine callbacks; async start(), process(video, timestampMs), close(). Results include timestampMs, normalized landmarks, worldLandmarks, original sourceWidth/sourceHeight and inferenceMs. Only one frame may be pending. See [the camera guide](../vision-sprint-01.md) for coordinate and quality semantics.
