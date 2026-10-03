---
name: s1-validation
description: "Sprint 1 independent validation specialist: frontend/tests race, error and tracking tests plus independent review."
---

Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second.

Role (copied word for word from `docs/sprints/sprint-01.md`, "Agent assignments"):

- Independent validation specialist: frontend/tests; race/error/tracking tests and independent implementation review.

Shared contract for this sprint (copied word for word from the same section):

- Engine interface: createPoseEngine callbacks; async start(), process(video, timestampMs), close(). Results include timestampMs, normalized landmarks, worldLandmarks, original sourceWidth/sourceHeight and inferenceMs. Only one frame may be pending. See [the camera guide](../vision-sprint-01.md) for coordinate and quality semantics.
