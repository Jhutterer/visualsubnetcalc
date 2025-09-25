# Orchestrator Agent

Purpose: Coordinate `src` and `dist` agents to deliver changes in small, testable milestones. For each milestone: plan → implement → test → present summary/diff/test output for explicit human approval → commit on a feature branch → continue. Never advance without approval.

Inputs reviewed: `app/.prompts/BuildingProject.PRD.v3.md`, `app/.prompts/src.Agent.md`, `app/.prompts/dist.Agent.md`. The PRD-aligned milestones below reflect v3.

## Ground Rules

- Human gate: After each milestone, present summary + diff + full test output; pause for approval.
- Branching: Use a feature branch (e.g., `feat/orchestrated-transition`), atomic Conventional Commits, rebase cleanly, no squash until final.
- Tests: Start targeted, then full suite. Keep tests green.
- Auto-fix loop: On failure, attempt up to 2 focused fixes → retest → report. Escalate if still failing.
- Minimal scope: Only change what the milestone needs.

## Environment & Commands

- Node 20 + npm; see `README.md`.
- Playwright tests serve `dist` at `https://localhost:8443` (via `npm run local-secure-start`).
- Certs: `npm run setup:certs` (requires `mkcert`). Request approval to install if missing.
- Build: `npm run build` (requires `sass`; `postinstall` installs global `sass@1.77.6`). If blocked, switch to local devDependency `sass` and call local binary.

Standard test run (PowerShell):
- `cd src`
- `npm ci` (or `npm install`)
- `npm run setup:certs`
- `npx playwright install --with-deps` (may require approval)
- `npm test`

Artifacts per run:
- Summary (pass/fail, duration, failing specs)
- Diff (`git diff --staged` before commit, final diff on request)
- Logs (build + test console output)
- Report (`src\\playwright-report`)

## Collaboration Model

- src Agent: Owns `src/**` (tests/config/scripts). Adds minimal tests when needed.
- dist Agent: Owns `dist/**` as build output. Avoid manual drift from source.
- Orchestrator: Plans, coordinates, tests, prepares approval packets, and enforces git hygiene.

## Workflow (per milestone)

1) Plan scope and acceptance/test list
2) Create/switch `feat/orchestrated-transition`
3) Implement via `src`/`dist` agents (minimal files only)
4) Stage changes; self-review
5) Run targeted tests, then full suite
6) Present summary + diff + test output; wait for approval
7) Commit with provided message; push branch
8) On failures: auto-fix loop (max 2) → escalate if unresolved

## Milestones

Milestone 0 — Orchestrator Bootstrap
- Description: Add this file and validate structure/workflow.
- Affected files: `app/.prompts/orchestrator.Agent.md`
- Test: `cd src && npm ci && npm run build && npm -v` (no Playwright yet)
- Commit: `chore(orchestrator): add orchestrator agent and bootstrap plan`

Milestone 1 — Baseline Build & Test Validation
- Description: Ensure local build + full Playwright suite runs and is green. Address env gaps (sass/certs/browsers).
- Affected files: none unless minimal fixes are required (see below)
- Test: `cd src && npm ci && npm run setup:certs && npx playwright install --with-deps && npm test`
- Auto-fix examples (max 2 attempts):
  - Add local `sass` devDependency and call local binary in `build` script if global install blocked
  - Request approval to install `mkcert` (or temporarily switch to http for local-only validation and revert)
  - Request approval to download Playwright browsers
- Commit (only if changes): `build(test): make local build/test reproducible (sass/certs/playwright)`

Milestone 2 — Dist Asset Hygiene
- Description: Ensure `dist/**` reflects source-of-truth; remove manual drift and document build.
- Affected files: `dist/**` (via rebuild), `src/package.json`, `README.md`
- Test: `cd src && npm run build && npm test`
 - Commit: `chore(dist): align built assets with source-of-truth`

PRD v3 — Concrete Milestones

M0: SQLite Foundations
- Description: Integrate SQLite WASM; implement Open/Create using File System Access API; establish DAO and migrations.
- Affected files: `dist/js/main.js`, `dist/index.html`, `app/plannerSchema.sql`, `app/database-schema.md`, `src/tests/planner-basics.spec.ts` (new)
- Test (run):
  - Targeted new test: `cd src && npm test -- tests/planner-basics.spec.ts`
  - Full: `cd src && npm test`
- Commit: `feat(sqlite): add SQLite WASM, DAO, and DB open/create with migrations`

M1: Replace In-Memory State with DB
- Description: Route calculator and planner state through SQL; add transactions; reload reflects DB contents.
- Affected files: `dist/js/main.js`, `dist/index.html`, `src/tests/deep-functional.spec.ts` (updated), `src/tests/subnet-basic.spec.ts` (updated)
- Test: `cd src && npm test`
- Commit: `refactor(state): move app state to SQLite-backed DAO with transactions`

M2: Subnets + VLAN/Gateway/VRF/Purpose
- Description: Split/merge subnets; enforce VLAN uniqueness per building; gateway validation; VRF on subnets; capacity counters.
- Affected files: `dist/js/main.js`, `dist/index.html`, `app/plannerSchema.sql` (indices/constraints), `src/tests/subnet-basic.spec.ts` (updated), new tests as needed
- Test: `cd src && npm test`
- Commit: `feat(subnets): enforce VLAN uniqueness, gateway rules, VRF, and capacity tracking`

M3: Interface Assignment (+MGMT, +INTERCONNECT, +Loopbacks)
- Description: Assignment UI; next-available suggestions; VRF propagation; /31 or /30 interconnect rules; loopbacks.
- Affected files: `dist/index.html`, `dist/js/main.js`, `app/plannerSchema.sql`, `src/tests/real-world-functional.spec.ts` (new or updated)
- Test: `cd src && npm test`
- Commit: `feat(interfaces): implement IP assignment (MGMT/INTERCONNECT/LOOPBACK) with validation`

M4: Save/Load & XML Export
- Description: Save/Load .sqlite via File System Access API; OPFS/in-memory fallbacks; XML export with deterministic ordering (optional XSD).
- Affected files: `dist/index.html`, `dist/js/main.js`, `src/tests/import-export.spec.ts` (expanded for XML), new `src/tests/planner-save-load.spec.ts`
- Test: `cd src && npm test`
- Commit: `feat(persistence): add Save/Load flows and XML export`

M5: Remove URL Sharing
- Description: Remove shareable URL features and lz-string; update UI/docs/tests.
- Affected files: `dist/index.html` (remove UI and script includes), `dist/js/main.js` (remove URL logic), `dist/js/lz-string.min.js` (delete), `src/package.json` (remove copy step), `src/tests/url-sharing.spec.ts` (remove/replace), `README.md`
- Test: `cd src && npm test` (ensure suite passes without URL sharing tests)
- Commit: `feat(storage): remove URL sharing and lz-string; migrate tests`

M6: Polish & Undo/Redo
- Description: Undo/redo for split/merge/assign/move; bulk tools; notes/tags; performance tuning.
- Affected files: `dist/js/main.js`, `dist/index.html`, `src/tests/ui-usage.spec.ts` (expanded), additional targeted tests
- Test: `cd src && npm test`
- Commit: `feat(ux): add undo/redo and polish planner workflows`

Milestone 3+ — PRD-Driven Feature Units (Template)
- ID/Name: <short feature>
- Description: <from PRD section X.Y>
- Affected files: <explicit minimal set>
- Implementation:
  - src Agent: <`src/**` changes>
  - dist Agent: <`dist/**` via rebuild or explicit change>
- Test: targeted specs first, then `cd src && npm test`
- Commit: `<conventional commit summary>`

Examples (for future PRD items):
- Files: <list specific files>
- Commit: `<conventional commit message>`

## Approval Packet (each milestone)
- Summary: goal, changed files count, risks/rollback
- Diff: staged changes (and final diff if requested)
- Test Output: build + full Playwright output; link to `src\\playwright-report`

## Git Hygiene
- Feature branch per effort (e.g., `feat/orchestrated-transition`)
- Atomic Conventional Commits; rebase regularly
- No squash until final merge; preserve useful history

## Next Steps
- Provide `BuildingProject.PRD.v3.md`, `src.Agent.md`, `dist.Agent.md`
- Approve Milestone 0 (commit this file), then proceed to Milestone 1
- Expand Milestone 3+ from the PRD
