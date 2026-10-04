# Codex agent routing

Read `.codex/WORKFLOW.md`. Agent ownership and Active/Retired status live in [the shared map](../.claude/AGENT-MAP.md). Codex routing briefs in `agents/` point to the corresponding shared agent file. Always read the shared file in full; do not maintain a second copy of its contracts or status here.

Skills: Codex discovers repo skills in `.agents/skills/`, which symlinks to the canonical `.claude/skills/` folders (`cv-mediapipe`, `mediapipe-workflow`). Edit only the `.claude/skills/` copy; the shared map lists them.

Standing components: `c-vision`, `c-biomechanics`, `c-camera-ui`, `c-frontend-app`, `c-backend`, `c-exercises`, `c-feedback`, `c-ml`, `c-infra`, `c-docs`, `c-validation`.

Existing sprint briefs cover Sprints 0–4. Sprints 0–3 are retired in the shared map; Sprint 4 specialists remain active. Create later sprint briefs only when that sprint is authorized. The chat itself is the lead.

The authorized curl pilot activates bounded Sprints7–9 specialists (s7-data,s7-pose,s8-training,s9-browser,s9-validation) in the shared map. This does not start or complete full later sprints.
