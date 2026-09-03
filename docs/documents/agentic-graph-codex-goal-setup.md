---
name: Follow a goal
tagline: Give Codex a durable objective for long-running work.
summary: Use `/goal` when a task needs Codex to keep working across turns toward
  a verifiable stopping condition.
bestFor:
  - Long-running coding work with a clear success condition and validation loop.
  - Code migrations, large refactors, deployment retry loops, experiments,
    games, and side projects where Codex can keep making scoped progress.
  - Teams that need to run long experiments with clear success criteria.
starterPrompt:
  title: Set a Long-Running Goal
  body: /goal Complete [objective] without stopping until [verifiable end state].
relatedLinks:
  - label: "`/goal` in CLI slash commands"
    url: /codex/cli/slash-commands#set-an-experimental-goal-with-goal
  - label: Codex workflows
    url: /codex/workflows
  - label: Run code migrations
    url: /codex/use-cases/code-migrations
  - label: Iterate on difficult problems
    url: /codex/use-cases/iterate-on-difficult-problems
---

# Follow a goal

## agentic-graph setup

agentic-graph keeps its durable Codex objective in the repo-root `goal` file. That goal is the local contract for long-running harness work: it names the objective, constraints, validation loop, proof artifacts, and stopping condition.

The goal loop is the native agentic-graph long-horizon SuperAgent message gateway for local research, code, and create work. It uses repo-owned run memory, traces, role-scoped agent contracts, tools, skills, and sandbox/workspace artifacts through `agentic_graph_parser`; DeerFlow may be cited only as conceptual inspiration or used as an optional local gateway provider, never as copied runtime architecture or a required deploy target.

Enable the experimental Codex goal feature in Codex config:

```toml
[features]
goals = true
```

Then use `/goal` from Codex while working in `$GITHUB_ROOT/agentic-graph`, or run the same repo-owned goal loop through the local harness:

```bash
npm run goal:run
```

The script calls:

```bash
python3 -m agentic_graph_parser run-goal \
  --input docs/documents/my-input.md \
  --goal-file goal \
  --output-dir data/outputs/goal-run-current \
  --run-id goal-run-current \
  --print-summary
```

The proof output lands in `data/outputs/goal-run-current/`, including `state.json`, `trace.jsonl`, `goal.json`, `final-report.md`, `harness-proof.json`, and generated workspace artifacts.

No Prod mirror or Cloudflare deploy is implied by `npm run goal:run`; publish/deploy remains a separate explicit operator action.

## Introduction

Use `/goal` when you want Codex to keep working toward one durable objective instead of stopping after one normal turn. It is useful for work that has a clear target, a validation loop, and enough room for Codex to make progress without asking you to steer every step. When you use `/goal`, Codex can work independently for multiple hours without needing your input.

`/goal` is an experimental Codex CLI feature. Enable it from `/experimental`, or add `goals = true` under `[features]` in `config.toml`. Then set a goal with `/goal <objective>`, check the current goal with `/goal`, and use `/goal pause`, `/goal resume`, or `/goal clear` when you need to control the run.

## Choose the right work

A good goal is bigger than one prompt but smaller than an open-ended backlog. It should define what Codex should achieve, what it should not change, how it should validate progress, and when it should stop.

This works well for:

- code migration where the target stack, parity checks, and constraints are clear
- large refactors where Codex can run tests after each checkpoint
- experiments, games, or prototypes where Codex can keep improving a working artifact

Avoid using a goal for a loose list of unrelated work.

## Set up the loop

1. Name one objective and one stopping condition.
2. Point Codex at the files, docs, issue, logs, or plan it must read first.
3. Define the commands or artifacts that prove progress.
4. Tell Codex to work in checkpoints and keep a short progress log.
5. Use `/goal` to inspect status while it runs.
6. Pause, resume, or clear the goal when the run is done, blocked, or changing direction.

The important part is the contract. Codex should know what "done" means before it starts. If the goal is a migration, "done" might mean the new path passes contract tests and the legacy path still has a rollback. If the goal is a game or prototype, "done" might mean the app builds, launches, and matches the input reference or expected behavior.

Ask Codex to help: start by having a conversation about what you want to build, then ask it to directly set a goal and start working.

## Let Codex work independently

During a goal, ask for compact progress reports that make the run easy to trust. A useful status update names the current checkpoint, what was verified, what remains, and whether Codex is blocked.

If the status becomes vague, tighten the goal rather than adding more ad hoc instructions. Tell Codex exactly which checkpoint matters next, which command proves it, and what should cause it to pause.

When Codex follows a goal, it can work independently for many hours without you having to check in. It will stop running when it is fairly confident it has reached the stopping condition, so you should think of `/goal` as a background task you do not need to monitor.

## Example goals

### Migrations

Whether you are migrating games to a new stack, mobile apps to a new platform, or a codebase to a new framework, you can use `/goal` to have Codex run the migration.

### Prototype creation

Whether you are creating a new app from scratch, a new game, or a new feature, you can use `/goal` to have Codex complete a polished first version. You can use a `PLAN.md` file to guide the creation of the first version, describing precisely what you want to build.

### Prompt optimization

When you have an eval suite, you can use `/goal` to optimize prompts against the eval results. Codex can inspect failures, update the prompt, rerun the evals, and keep iterating until the score improves or it reaches your stopping condition.
