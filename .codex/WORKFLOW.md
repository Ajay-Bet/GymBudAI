# Codex adapter for the shared GymBud workflow

Read `AGENTS.md`, `docs/project-instructions.md`, `docs/MASTER.md`, and `docs/WORKFLOW.md` first. The shared workflow and `.claude/AGENT-MAP.md` remain canonical for ownership, agent status, contracts, and sprint records. This directory adapts those files for Codex; it does not replace Claude's setup.

## Catch-up mode

User direction, 2026-10-03: Sprints 1–3 are completed; Sprint 4 is mostly completed. Upcoming Sprint 1–4 chats and documents are for memory intake until the user explicitly starts/resumes implementation. A chat title alone is not a work trigger.

For intake, read the supplied reference and corresponding saved sprint record/status. Record relevant new user context separately from historical requirements and actual validation evidence in that sprint's existing handoff. Preserve unresolved findings and completion evidence. Do not restart sprints or retire active Sprint 4 specialists merely because a document is provided.

## Agent routing during authorized work

1. The current sprint chat is the lead; there is no persistent background sprint agent. Select the sprint's active `sN-` briefs from `.claude/AGENT-MAP.md`. Outside a sprint, select the owning `c-` briefs.
2. `.codex/agents/*.md` are routing briefs read by the lead and included in spawned agents' instructions. They are not a claim that Markdown files automatically launch processes. Read their canonical `.claude/agents/` targets in full at assignment time, including lessons and carryover.
3. Instantiate the relevant component owners and sprint specialists with available collaboration tools. The sprint specialist can serve as the component's designated writer for its assigned paths; record that mapping instead of requiring duplicate agents. Retired `sN-` files are historical context only.
4. Assign explicit tasks, owned files, dependencies, acceptance criteria, and expected reports. Parallelize independent work within the session limit. A specialist may spawn a bounded subtask when capacity is available; report its ownership to the lead first. Never promise more concurrency than the tools support.
5. Send findings, proposed changes to another component's files, and interface changes to its designated owner through agent messaging, with the lead informed. Do not edit another owner's files without a recorded reassignment. Queue work when its owner is unavailable; the lead may explicitly take ownership.
6. Keep one writer per file, including shared guides and agent records. Read-only review can overlap implementation. Resolve contract changes before dependent edits.
7. Update the canonical component records and sprint handoff as work happens. On sprint acceptance, update touched component records and retire its specialists in the canonical map. When adding an agent, add a Codex routing brief pointing to its shared file.

## Continuity

- Sprints 0–2: existing `docs/sprints/sprint-00.md`, `sprint-01.md`, `sprint-02.md`.
- Sprint 3 onward: `docs/sprints/sprint-N.md` requirements and `sprint-N-STATUS.md` evidence/handoff.
- Preserve all existing uncommitted work. This setup authorizes workflow files only, not application changes, commits, pushes, or merges.
- User-reported progress and repository evidence are distinct. Sprint 4's saved status still lists pending live/recording validation; carry it forward honestly.
- Context supplied in one chat reaches later chats through these files, not persistent subagent memory or assumed access to other chats.
