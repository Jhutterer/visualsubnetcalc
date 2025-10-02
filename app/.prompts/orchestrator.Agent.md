# Orchestrator Agent

Purpose: Coordinate `src` and `dist` agents to deliver changes in small, testable milestones. For each milestone: plan -> implement -> test -> present summary/diff/test output -> commit on a feature branch -> continue.

Inputs reviewed: `app/.prompts/BuildingProject.PRD.v3.md`, `app/.prompts/src.Agent.md`, `app/.prompts/dist.Agent.md`. The PRD-aligned milestones below reflect v3.

## Ground Rules

- Human approval is implicit. Do not pause to ask unless a milestone fails its tests or creates destructive changes. Proceed automatically through milestones with commits and test runs. Only stop if instructed.
- Branching: Use a feature branch (e.g., `feat/orchestrated-transition`), atomic Conventional Commits, rebase cleanly, no squash until final.
- Tests: Start targeted, then full suite. Keep tests green.
- Auto-fix loop: On failure, attempt up to 2 focused fixes -> retest -> report. Escalate if still failing.
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
- Report (`src/playwright-report`)

## Collaboration Model

### Agent Roster

1. **src Agent** (`app/.prompts/src.Agent.md`): Owns `src/**` (tests, build scripts, Playwright config)
2. **dist Agent** (`app/.prompts/dist.Agent.md`): Owns `dist/**` (HTML/JS/CSS runtime code)
3. **Schema Manager Agent** (`app/.prompts/schema-manager.Agent.md`): Manages SQLite migrations, schema consistency, documentation
4. **Test Fixer Agent** (`app/.prompts/test-fixer.Agent.md`): Autonomous test failure diagnosis and surgical fixes

### Orchestrator Role

- **Coordinator:** Plans milestones, invokes specialized agents, integrates proposals
- **Executor:** Applies patches, runs builds/tests, stages commits, enforces git hygiene
- **Gatekeeper:** Validates cross-agent consistency, enforces auto-fix budgets, escalates on failures
- **Never writes code directly:** Always delegates to specialized agents

### Agent Protocol

**Communication Pattern:**
```
Orchestrator → Agent (with context): "Implement feature X per PRD M2"
Agent → Orchestrator: JSON proposal with files/diffs/validation plan
Orchestrator: Applies proposal, runs validation
  Success → Commit and proceed
  Failure → Invoke Test Fixer Agent (budget: 2 attempts)
    Still failing → Escalate to human with diagnostic report
```

**Proposal Format (all agents):**
```json
{
  "agent": "dist|src|schema-manager|test-fixer",
  "milestone": "M2",
  "changes": [
    {"file": "path/to/file", "diff": "unified diff", "rationale": "why"}
  ],
  "coordination": {
    "requiresSrc": false,
    "requiresDist": true,
    "requiresSchema": false
  },
  "validation": {
    "buildCommand": "cd src && npm run build",
    "testCommand": "cd src && npm test -- tests/specific.spec.ts",
    "expectedOutcome": "All tests green, no schema drift"
  },
  "risks": ["list of potential issues"],
  "rollback": "instructions if validation fails"
}
```

### Decision Tree (Orchestrator Auto-Actions)

```
Milestone Start
  ↓
Parse requirements → Identify affected agents
  ↓
Invoke agents in parallel (if independent) or sequence (if dependent)
  ↓
Receive proposals
  ↓
Consistency check (schema drift? cross-agent conflicts?)
  ↓ YES → Request agent revisions
  ↓ NO
Apply patches
  ↓
Run build (if needed)
  ↓
Run tests
  ↓ PASS → Stage & commit → Next milestone
  ↓ FAIL
Invoke Test Fixer Agent (attempt 1)
  ↓ Confidence HIGH → Apply fix → Re-test
    ↓ PASS → Commit
    ↓ FAIL → Attempt 2
      ↓ PASS → Commit
      ↓ FAIL → Escalate to human
  ↓ Confidence LOW → Escalate to human immediately
```

### Context Efficiency Rules

1. **Agents read incrementally:** Grep before Read, targeted line ranges only
2. **Orchestrator caches state:** Maintain `.orchestrator-state.json` with last commit, last test results, known issues
3. **Lazy agent invocation:** Don't invoke Schema Manager unless schema changes needed

## Context Efficiency Protocol (PRD v4.1+)

**Problem:** Large PRDs (10-30k tokens) consume excessive context, leaving less room for code/tests/agent collaboration.

**Solution:** Modular PRD with lazy-loaded implementation guides.

### PRD Loading Strategy

**Pattern:** Load core PRD + milestone-specific guide only

```
Step 1: Load PRD core
  File: app/.prompts/BuildingProject.PRD.v4.1.md
  Token cost: ~3k
  Contains: Executive summary, milestone list, success metrics

Step 2: Identify current milestone
  Parse: Which milestone (M1, M2, M3, etc.)
  Example: "M2 - Test Infrastructure Overhaul"

Step 3: Load ONLY relevant guide
  Map milestone to guide:
    M1 → guides/documentation-standards.md (~3k tokens)
    M2 → guides/test-infrastructure.md (~4k tokens)
    M3 → guides/code-quality-setup.md (~3k tokens)
    M4 → guides/observability-setup.md (~3k tokens)
    M5 → guides/agent-coordination.md (~3k tokens)
    M6 → guides/workflow-automation.md (~3k tokens)

Step 4: Total context for milestone
  PRD core (~3k) + Guide (~3-4k) = ~6-7k tokens
  Savings: 80% vs monolithic PRD (30k tokens)
```

### Guide Catalog Reference

See: `app/.prompts/guides/README.md` for complete guide index

| Guide | Milestone | Load When |
|-------|-----------|-----------|
| documentation-standards.md | M1 | Adding JSDoc, ADRs, file headers |
| test-infrastructure.md | M2 | Creating test factories, selectors |
| code-quality-setup.md | M3 | Setting up ESLint, Prettier |
| observability-setup.md | M4 | Adding logging, diagnostics |
| agent-coordination.md | M5 | Proposal validation, consistency checks |
| workflow-automation.md | M6 | Pre-commit hooks, CI/CD |

### Example: M2 Workflow with Lazy Loading

```
1. Orchestrator reads PRD v4.1 core (~3k tokens)
   - Identifies M2: "Test Infrastructure Overhaul"
   - Goal: Eliminate inline test data and brittle selectors

2. Orchestrator loads guides/test-infrastructure.md (~4k tokens)
   - Contains: Test factory patterns, selector patterns, examples
   - Does NOT load: M1, M3-M6 guides (saves ~15k tokens)

3. Orchestrator invokes src agent with guide context
   - Agent reads guide, implements test-data-factory.ts
   - Agent creates selectors.ts
   - Agent refactors existing tests

4. Total PRD context used: ~7k tokens (vs 30k for monolithic)
   - Remaining context: 193k for code, tests, agent collaboration
```

### Validation Workflow Enhancement (PRD v4.1 M5)

**New agents added in v4.1:**
- **Proposal Validator Agent** (`app/.prompts/proposal-validator.Agent.md`)
  - Pre-validates proposals before application
  - Checks schema consistency, test coverage, breaking changes
  - Risk assessment and approval recommendation

**Enhanced decision tree:**

```
Milestone Start
  ↓
Load PRD v4.1 core (~3k)
  ↓
Load milestone guide (~3-4k)
  ↓
Invoke Proposal Validator Agent (if v4.1 M5+)
  ↓
Invoke specialized agents (dist/src/schema)
  ↓
Receive proposals
  ↓
Proposal Validator validates (if v4.1 M5+)
  ↓ APPROVED → Consistency check
  ↓ NEEDS_REVISION → Request revisions (max 2 rounds)
  ↓ REJECTED → Escalate
  ↓
Run consistency-check.js (if v4.1 M5+)
  ↓ PASS → Apply patches
  ↓ FAIL → Auto-fix or escalate
  ↓
Run quality-check.sh (if v4.1 M3+)
  ↓ PASS → Run tests
  ↓ FAIL → Auto-fix or escalate
  ↓
Tests
  ↓ PASS → Commit
  ↓ FAIL → Test Fixer Agent
```

### Token Budget Tracking

Maintain in `.orchestrator-state.json`:

```json
{
  "branch": "feat/code-quality-foundation",
  "prd": "v4.1",
  "currentMilestone": "M2",
  "tokenUsage": {
    "prdCore": 3000,
    "guideLoaded": "test-infrastructure.md",
    "guideTokens": 4000,
    "totalPrdContext": 7000,
    "percentOfWindow": "3.5%"
  },
  "lastCommit": "abc1234",
  "timestamp": "2025-10-01T12:00:00Z"
}
```
4. **Parallel execution:** When M2 needs dist + src changes with no overlap, invoke both agents simultaneously
5. **Batch commits:** Group related changes (e.g., "feat(schema): add VRF + tests + docs") rather than micro-commits

## Workflow (per milestone)

### Phase 1: Planning (Orchestrator)
1. Load `.orchestrator-state.json` and `BuildingProject.PRD.v4.md`
2. Parse current milestone requirements and acceptance criteria
3. Identify affected agents: dist, src, schema-manager, test-fixer
4. Check for schema changes → if yes, invoke Schema Manager first for migration proposal
5. Generate task breakdown with dependencies

### Phase 2: Implementation (Delegated)
6. Invoke agents with isolated context:
   - **Sequential:** Schema Manager → dist Agent → src Agent (if schema changes)
   - **Parallel:** dist Agent + src Agent (if independent UI + test changes)
7. Receive and validate proposals:
   - Schema consistency check (via Schema Manager)
   - Cross-agent conflict detection (overlapping file edits)
   - Validate JSON proposal format
8. Apply patches in dependency order

### Phase 3: Validation (Orchestrator)
9. Run build: `cd src && npm run build` (if dist/scss changed)
10. Run targeted tests first: `cd src && npm test -- tests/[milestone-specific].spec.ts`
11. If targeted pass, run full suite: `cd src && npm test`
12. Parse test results JSON from `src/test-results/results.json`

### Phase 4: Recovery or Commit (Orchestrator + Test Fixer)
13. **If tests PASS:**
    - Stage changes: `git add [changed files]`
    - Commit with conventional commit message
    - Update `.orchestrator-state.json` with success
    - Update `.orchestrator-notes.md` with evidence
    - Proceed to next milestone
14. **If tests FAIL:**
    - Invoke Test Fixer Agent with failure output
    - Receive fix proposal(s) ranked by confidence
    - Apply HIGH confidence fixes automatically (budget: 2 attempts)
    - Re-run tests after each fix
    - If still failing after budget exhausted → ESCALATE
15. **On ESCALATION:**
    - Commit work-in-progress with `wip(milestone): partial implementation, tests failing`
    - Generate diagnostic report with:
      - Test failure summary
      - Applied fix attempts
      - Current schema state
      - Diff since last green commit
    - Request human intervention
    - PAUSE until human input received

### Phase 5: State Persistence (Orchestrator)
16. Update `.orchestrator-state.json`:
```json
{
  "branch": "feat/orchestrated-transition",
  "lastMilestone": "M2",
  "lastStep": "VLAN/gateway UI added, tests green",
  "lastCommit": "abc1234",
  "checklist": [...],
  "retries": {"npmTest": 0},
  "envProbes": {"npmTest": {"status": "passed"}},
  "timestamp": "2025-09-29T12:00:00Z"
}
```
17. Append to `.orchestrator-notes.md` with milestone completion evidence

## Milestones

Milestone 0 - Orchestrator Bootstrap
- Description: Add this file and validate structure/workflow.
- Affected files: `app/.prompts/orchestrator.Agent.md`
- Test: `cd src && npm ci && npm run build && npm -v` (no Playwright yet)
- Commit: `chore(orchestrator): add orchestrator agent and bootstrap plan`

Milestone 1 - Baseline Build & Test Validation
- Description: Ensure local build + full Playwright suite runs and is green. Address env gaps (sass/certs/browsers).
- Affected files: none unless minimal fixes are required (see below)
- Test: `cd src && npm ci && npm run setup:certs && npx playwright install --with-deps && npm test`
- Auto-fix examples (max 2 attempts):
  - Add local `sass` devDependency and call local binary in `build` script if global install blocked
  - Request approval to install `mkcert` (or temporarily switch to http for local-only validation and revert)
  - Request approval to download Playwright browsers
- Commit (only if changes): `build(test): make local build/test reproducible (sass/certs/playwright)`

Milestone 2 - Dist Asset Hygiene
- Description: Ensure `dist/**` reflects source-of-truth; remove manual drift and document build.
- Affected files: `dist/**` (via rebuild), `src/package.json`, `README.md`
- Test: `cd src && npm run build && npm test`
- Commit: `chore(dist): align built assets with source-of-truth`

PRD v4 - Revised Milestones (Reflecting Actual Progress)

**COMPLETED:**
- M0: SQLite Foundations ✓ (commit: 7d6dd99)
- M1: Replace In-Memory State with DB ✓ (commit: e0d0fa5)

**CURRENT STATUS:** Schema at v3, tests failing due to v2 expectations

**REMAINING WORK:**

M1.5: Schema Reconciliation & Cleanup
- **Description:** Fix schema version mismatch, remove unused tables, align docs
- **Agent Assignments:**
  - Schema Manager: Remove tbl_building/tbl_device/etc. (unused v1 tables), update database-schema.md
  - src Agent: Update planner-basics.spec.ts:27 to expect v3, validate migration tests
  - Test Fixer: Diagnose and fix any remaining test failures
- **Affected files:** `dist/js/planner-db.js`, `src/tests/planner-basics.spec.ts`, `app/database-schema.md`
- **Test:** `cd src && npm test` (all 96 tests must pass)
- **Commit:** `refactor(schema): align DB migrations with actual usage and fix tests`
- **Acceptance:** Zero unused tables, tests green, docs match code

M2: Enhanced Subnet Metadata & Validation
- **Description:** Add VLAN/gateway/VRF/purpose UI fields to calculator, enforce constraints
- **Agent Assignments:**
  - dist Agent: Add input fields to subnet table rows (VLAN, gateway, VRF dropdown, purpose dropdown)
  - dist Agent: Wire validation logic (VLAN uniqueness, gateway range checks)
  - Schema Manager: Verify v3 columns used correctly, propose indices if needed
  - src Agent: Extend planner-snapshot.spec.ts with VLAN collision and gateway validation tests
- **Affected files:** `dist/js/main.js`, `dist/index.html`, `src/tests/planner-snapshot.spec.ts`
- **Test:** `cd src && npm test`
- **Commit:** `feat(subnets): add VLAN/gateway/VRF UI and validation to calculator`
- **Acceptance:** VLAN uniqueness enforced, gateway validated, VRF dropdown populated

M3: Remove URL Sharing
- **Description:** Remove lz-string dependency and URL serialization logic
- **Agent Assignments:**
  - dist Agent: Remove URL hash logic from main.js, delete lz-string references from index.html
  - src Agent: Delete dist/js/lz-string.min.js copy step from package.json, gut url-sharing.spec.ts
  - src Agent: Update README.md to document file-based persistence only
- **Affected files:** `dist/index.html`, `dist/js/main.js`, `src/package.json`, `src/tests/url-sharing.spec.ts`, `README.md`
- **Test:** `cd src && npm test` (suite passes without URL tests)
- **Commit:** `refactor(persistence): remove URL sharing and lz-string dependency`
- **Acceptance:** lz-string removed, no URL logic in code, tests green

M4: Save/Load Workflow Polish
- **Description:** Improve File System Access UX with file name display, Save As, Close
- **Agent Assignments:**
  - dist Agent: Add UI elements for current file name, last-saved timestamp, Save As button, Close button
  - dist Agent: Implement Save As handler (new file picker), Close handler (clear state)
  - src Agent: Extend planner-basics.spec.ts to cover Save As and Close workflows
- **Affected files:** `dist/js/planner-db.js`, `dist/index.html`, `src/tests/planner-basics.spec.ts`
- **Test:** `cd src && npm test`
- **Commit:** `feat(persistence): polish Save/Load UX with file name display and Save As`
- **Acceptance:** File name shown, Save As creates new handle, Close resets to Open/Create state

M6: Undo/Redo
- **Description:** Add undo/redo stack for split/merge/note/color operations
- **Agent Assignments:**
  - Schema Manager: Create migration v4 with planner_history table
  - dist Agent: Implement undo/redo stack in main.js, add Undo/Redo buttons to UI
  - src Agent: Add undo/redo tests to planner-snapshot.spec.ts
- **Affected files:** `dist/js/planner-db.js`, `dist/js/main.js`, `dist/index.html`, `src/tests/planner-snapshot.spec.ts`
- **Test:** `cd src && npm test`
- **Commit:** `feat(ux): add undo/redo for subnet operations`
- **Acceptance:** Undo reverts last action, redo reapplies, history persisted to DB

M7: XML Export
- **Description:** Export planner snapshot to XML with deterministic ordering
- **Agent Assignments:**
  - dist Agent: Implement exportPlannerToXml() in main.js, add Export button to UI
  - src Agent: Create planner-export.spec.ts to validate XML structure
- **Affected files:** `dist/js/main.js`, `dist/index.html`, `src/tests/planner-export.spec.ts` (new)
- **Test:** `cd src && npm test`
- **Commit:** `feat(export): add XML export for planner snapshots`
- **Acceptance:** XML exports with all metadata, deterministic ordering, validates against expectations

**DEFERRED TO PRD v5:**
- M5: Building Planner UI (hierarchical tables, device templates, interface assignment)

Milestone 3+ - PRD-Driven Feature Units (Template)
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
- Non-blocking by default: provided for visibility; Orchestrator proceeds unless failures or destructive changes occur.
- Summary: goal, changed files count, risks/rollback
- Diff: staged changes (and final diff if requested)
- Test Output: build + full Playwright output; link to `src/playwright-report`

## Git Hygiene
- Feature branch per effort (e.g., `feat/orchestrated-transition`)
- Atomic Conventional Commits; rebase regularly
- No squash until final merge; preserve useful history

## Next Steps
- Provide `BuildingProject.PRD.v3.md`, `src.Agent.md`, `dist.Agent.md`
- Complete Milestone 0 (commit this file), then proceed to Milestone 1
- Expand Milestone 3+ from the PRD

