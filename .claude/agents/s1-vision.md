---
name: s1-vision
description: "Sprint 1 browser vision specialist: PoseEngine, pose worker, tracking and drawing helpers."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

Role (copied word for word from `docs/sprints/sprint-01.md`, "Agent assignments"):

- Browser vision specialist: vision/PoseEngine.js, pose.worker.js, tracking.js and drawPose.js; bounded detection, worker resource ownership, quality and drawing helpers.

Shared contract for this sprint (copied word for word from the same section):

- Engine interface: createPoseEngine callbacks; async start(), process(video, timestampMs), close(). Results include timestampMs, normalized landmarks, worldLandmarks, original sourceWidth/sourceHeight and inferenceMs. Only one frame may be pending. See [the camera guide](../vision-sprint-01.md) for coordinate and quality semantics.
