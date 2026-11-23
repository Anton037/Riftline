# AI Contributor Workflow

Riftline is maintained by a human owner; AI agents contribute under review.
Every change made by an AI agent or automation **must** follow the workflow
below, regardless of which tool you are (Antigravity, Claude, Codex, Cursor,
Copilot, ...). It applies to every task, including "small" fixes.

## The workflow

1. **Branch first, never commit to `main`.**
   - Create a fresh branch from the latest `main` before touching any file.
   - Branch naming: `ai/<short-topic>`, e.g. `ai/save-recovery-fix` or
     `ai/audio-overhaul`.
   - Direct pushes to `main` by agents are forbidden.

2. **Clean commits only.**
   - One logical change per commit. No "misc fixes", no WIP dumps.
   - Write imperative, descriptive messages that say *what* changed and *why*;
     use the body for anything non-obvious. See `git log` for the house style.
   - Do not reformat, rename, or "clean up" unrelated code inside a
     feature commit. Keep diffs reviewable.

3. **Open a pull request for everything.**
   - Target `main`. One PR per topic, not one giant PR per session.
   - PR body: what changed, why, how it was verified, and any follow-ups.

4. **Verify before requesting review.** Run the repo's own gate on your branch:
   - `npm run check` — combined release gate; if it fails, fix before review.
   - Fast loops: `npm run lint`, `npm run format:check`, `npm run test:unit`,
     `npm run build`. Browser tests: `npm run e2e`.
   - Keep CI green on the PR. If a check fails, push a fix on the same branch.

5. **The owner merges — not you.**
   - After opening the PR, stop and wait for review from @Anton037.
   - Do not merge, do not push to `main`, do not force-push a branch that has
     an open PR.
   - Address review feedback with additional commits on the same branch.
   - Only @Anton037 merges PRs. Merge method is the owner's choice.

## Ground rules

- Keep `main` releasable at all times: every PR must build and pass tests.
- Scope discipline: change only what the task requires. If you notice
  something else worth fixing, mention it in the PR instead of changing it
  silently.
- Never rewrite history (force-push, rebasing shared branches) unless the
  owner explicitly asks for it.
- Respect existing conventions: read `docs/DEVELOPMENT.md` for architecture
  notes and `docs/TESTING.md` for the test setup before writing code.
- If a task is ambiguous, ask in the PR or an issue before implementing a
  guess.

## Why this exists

AI sessions have previously landed large multi-topic commits directly on
`main`, which made history hard to review and revert. This file makes the
expected workflow explicit so that every AI contribution arrives reviewable,
revertible, and with the owner in control of what reaches `main`.
