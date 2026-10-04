# GymBud chat workflow (shared by Codex, Claude Code and Cursor)

Codex reads this through `AGENTS.md`; Claude Code reads it through `CLAUDE.md`; Cursor reads it through `AGENTS.md` and `.cursor/rules/gymbud.mdc`. All three tools follow the same rules, agents and records. A chat in any of them can be the master chat or a sprint chat.

## Rules and precedence

- The master instructions are `AGENTS.md`, `docs/project-instructions.md` and `docs/MASTER.md`. They apply to the whole project, every sprint and every agent.
- The master instructions always override sprint requirements. If they conflict, the sprint chat flags the conflict to the user instead of choosing on its own.

## Chats

- **Current catch-up direction (2026-10-03).** The user reports Sprints 1–3 completed and Sprint 4 mostly completed, and will supply Sprint 1–4 documents in new chats for memory intake. Read and reconcile those references with saved handoffs; do not launch implementation until explicitly requested. Documents do not independently authorize work. This direction takes precedence over sprint auto-initialization during catch-up.

- **Master chat.** The master chat owns `docs/MASTER.md` and the overall plan.
- **Sprint chats.** Each sprint has its own chat. A sprint chat starts with a message giving the sprint number and that sprint's requirements doc.
- A sprint chat:
  - saves its requirements to `docs/sprints/sprint-N.md`;
  - uses that sprint's `sN-` agents, briefed from the component agents they touch;
  - works only on that sprint's scope;
  - updates `docs/sprints/sprint-N-STATUS.md` before stopping;
  - on completion, updates the touched `c-` component agent files and retires its `sN-` agents.
- Sprint chats don't change `docs/MASTER.md`, `AGENTS.md`, `CLAUDE.md`, this file or other sprints' files. Component agent files (`.claude/agents/c-*.md`) are the exception: the sprint chat updates them when closing the sprint.

## Sprint records

- Sprints 0–2 keep their existing records (`docs/sprints/sprint-00.md`, `sprint-01.md`, `sprint-02.md`). Finish Sprint 2 in `sprint-02.md`.
- From Sprint 3 on, requirements go in `docs/sprints/sprint-N.md` (for example `sprint-3.md`). Status, evidence, decisions and handoff go in `docs/sprints/sprint-N-STATUS.md`, using the sections of `docs/sprints/TEMPLATE.md`.

## Shared agents

Agents come in two layers. The user chose this on 2026-10-03, replacing the earlier per-sprint-only setup.

- **Component agents** (`c-<component>`) are the standing owners. Each owns a part of the codebase (for example `c-biomechanics` owns `frontend/src/biomechanics/*`) and its file records that component's owned paths, contracts, history and open carryover. Between sprints, and for work outside a sprint, chats route work to the owning component agent.
- **Sprint agents** (`sN-<role>`) exist only while sprint N is open. A sprint chat creates them for its scope. Each sprint agent's brief is the matching component agent file(s) plus the sprint's requirements, and it may only edit files its component agents own (or new files the sprint assigns to a component).
- **Closing a sprint reverts work to the components.** Before a sprint is marked complete, the sprint chat updates each touched component agent file (new contracts, ownership changes, history line, carryover), adds any new component agent a new folder needs, and marks the sprint's `sN-` agents retired in `.claude/AGENT-MAP.md`. Retired sprint agent files stay as history and are not used again.
- Every agent file is plain Markdown in `.claude/agents/`, indexed in `.claude/AGENT-MAP.md`: a short frontmatter header (`name`, `description`), then the agent's instructions, starting with "Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second."
- Claude Code loads these files as subagents directly. Codex uses the same file's instructions as the brief when it spawns that specialist.
- Codex routing briefs are in `.codex/agents/`, with entry points `.codex/WORKFLOW.md` and `.codex/AGENT-MAP.md`. They point to these shared definitions; contracts and status remain canonical here. For component-file changes, communicate with its assigned owner via agent messaging before editing. A sprint specialist may be that component's designated writer. Specialists may delegate bounded subtasks within available concurrency, with ownership reported to the lead and one writer per file.
- Cursor's entry point is the always-applied rule `.cursor/rules/gymbud.mdc`. It points to `AGENTS.md`, this file and `.claude/AGENT-MAP.md`, and tells Cursor to brief each specialist from its `.claude/agents/` file. Cursor has no per-agent files, so nothing needs adding for Cursor when an agent is created.
- The sprint chat itself is the lead, so the lead has no agent file.
- Agents are briefed fresh in every chat from these files and the sprint records. Nothing carries over in agent memory between chats; the component files are how knowledge carries over.

## Keeping agent knowledge current

Agents teach the next agent by writing things down as they happen, not only at sprint close.

- **Component files stay live.** Whenever a contract, unit, threshold or owned path changes, a decision is made, or a defect, review finding or real-world test teaches something, the owning component's `c-` file is updated in the same change (its Contracts, History, Open carryover and Lessons learned sections).
- **Sprint records stay live.** The sprint chat records decisions, evidence and user feedback in its sprint record as they happen.
- **One writer per file.** A sprint or component agent updates only the component files it owns. Anyone else (for example validation reporting a defect) sends the update to the lead, who writes it. This avoids concurrent edits.
- **Briefs include the knowledge.** Every new `sN-` agent is briefed with the full component files it touches, including Lessons learned, so earlier lessons carry forward.
- **Reports name the write-back.** Each agent report ends by listing what it added or changed in component files and sprint records, or says "no knowledge updates".
- **Sprint close check.** Before a sprint is marked complete, the lead confirms every touched component file reflects the sprint, then retires the sprint agents.

## Commits

- No AI co-author trailers or AI authorship lines in commits or pull requests (see `AGENTS.md`). Claude Code's own attribution is turned off in `.claude/settings.json`; Codex and Cursor follow the same rule from `AGENTS.md`.
