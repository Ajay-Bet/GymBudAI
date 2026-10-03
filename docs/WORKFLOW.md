# GymBud chat workflow (shared by Codex and Claude Code)

Codex reads this through `AGENTS.md`; Claude Code reads it through `CLAUDE.md`. Both tools follow the same rules, agents and records.

## Rules and precedence

- The master instructions are `AGENTS.md`, `docs/project-instructions.md` and `docs/MASTER.md`. They apply to the whole project, every sprint and every agent.
- The master instructions always override sprint requirements. If they conflict, the sprint chat flags the conflict to the user instead of choosing on its own.

## Chats

- **Master chat.** The master chat owns `docs/MASTER.md` and the overall plan.
- **Sprint chats.** Each sprint has its own chat. A sprint chat starts with a message giving the sprint number and that sprint's requirements doc.
- A sprint chat:
  - saves its requirements to `docs/sprints/sprint-N.md`;
  - uses only that sprint's `sN-` agents;
  - works only on that sprint's scope;
  - updates `docs/sprints/sprint-N-STATUS.md` before stopping.
- Sprint chats don't change `docs/MASTER.md`, `AGENTS.md`, `CLAUDE.md`, this file or other sprints' files.

## Sprint records

- Sprints 0–2 keep their existing records (`docs/sprints/sprint-00.md`, `sprint-01.md`, `sprint-02.md`). Finish Sprint 2 in `sprint-02.md`.
- From Sprint 3 on, requirements go in `docs/sprints/sprint-N.md` (for example `sprint-3.md`). Status, evidence, decisions and handoff go in `docs/sprints/sprint-N-STATUS.md`, using the sections of `docs/sprints/TEMPLATE.md`.

## Shared agents

- Specialist agents are defined once in `.claude/agents/sN-<role>.md`, indexed in `.claude/AGENT-MAP.md`. Each file is plain Markdown: a short frontmatter header (`name`, `description`), then the agent's instructions.
- Claude Code loads these files as subagents directly. Codex uses the same file's instructions as the brief when it spawns that specialist.
- The sprint chat itself is the lead, so the lead has no agent file.
- If a sprint has no `sN-` agents yet, its sprint chat creates them in `.claude/agents/` before delegating, and adds them to `.claude/AGENT-MAP.md`. Each new agent's instructions start with: "Follow the GymBud master instructions in AGENTS.md first. Sprint rules come second."
- Agents are briefed fresh in every chat from these files and the sprint records. Nothing carries over in agent memory between chats.

## Commits

- No AI co-author trailers or AI authorship lines in commits or pull requests (see `AGENTS.md`). Claude Code's own attribution is turned off in `.claude/settings.json`.
