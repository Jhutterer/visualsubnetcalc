# Visual Subnet Calculator — Code Quality & Agent-Readiness PRD (v4.1)

**Status:** Draft - Foundation for Agent-Driven Development
**Branch:** feat/code-quality-foundation
**Last Updated:** 2025-10-01
**Supersedes:** PRD v4 (feature development)
**Token Budget:** ~3k (core PRD only, guides loaded separately)

## Executive Summary

PRD v4.1 establishes the infrastructure for seamless agent-driven development. While v4 focused on feature delivery (planner database, VLAN/VRF, undo/redo), **v4.1 focuses on code quality, documentation, and testing infrastructure** to enable autonomous development by AI agents and efficient onboarding of humans.

### Core Objectives

1. **Agent-Optimized Documentation:** Machine-readable annotations, ADRs, navigation maps
2. **Test Infrastructure Excellence:** Data factories, centralized selectors, visual/snapshot testing
3. **Code Quality Standards:** Linting, formatting, type safety, automated gates
4. **Observability & Debugging:** Structured logging, diagnostic dashboard
5. **Agent Coordination:** Proposal validation, consistency checking
6. **Workflow Automation:** Pre-commit hooks, CI/CD pipelines

### Why v4.1?

The v4 implementation revealed agent challenges:
- **Context Discovery:** Significant tokens spent searching for code
- **Schema Drift:** Inconsistencies between code/tests/docs
- **Test Brittleness:** Selector changes broke tests
- **Limited Observability:** Difficult to diagnose agent-applied changes

**v4.1 solves these** through machine-readable docs, automated checks, and robust test patterns.

## Token-Aware Architecture

### Modular Implementation Guides

**Pattern:** Core PRD (~3k tokens) + Milestone-specific guides (~3k each) = ~6k total per milestone

| Milestone | Guide | Token Cost | Load When |
|-----------|-------|------------|-----------|
| M1 | guides/documentation-standards.md | ~3k | M1 only |
| M2 | guides/test-infrastructure.md | ~4k | M2 only |
| M3 | guides/code-quality-setup.md | ~3k | M3 only |
| M4 | guides/observability-setup.md | ~3k | M4 only |
| M5 | guides/agent-coordination.md | ~3k | M5 only |
| M6 | guides/workflow-automation.md | ~3k | M6 only |

**Orchestrator Usage:**
1. Read PRD v4.1 core (~3k tokens)
2. Identify current milestone (e.g., M2)
3. Load ONLY `guides/test-infrastructure.md` (~4k tokens)
4. Total context: ~7k tokens (vs 30k for monolithic PRD)
5. **80% token savings**

See: `app/.prompts/guides/README.md` for guide catalog and usage patterns.

## Milestones

### M1: Documentation Infrastructure
**Goal:** Machine-readable documentation for 50-70% faster code discovery

**Tasks:**
- JSDoc `@agent-*` annotations on all major functions
- File-level architecture headers
- Create ADRs 001-006 in `app/adr/`
- Agents work from existing `codebase-map.md`

**Implementation:** See `guides/documentation-standards.md`

**Acceptance:**
- 100% of public functions have `@agent-summary`
- 6 ADRs created and reviewed
- Agents locate code in <5k tokens (vs 10k+ previously)

**Commit:** `docs(agents): add machine-readable documentation infrastructure`

---

### M2: Test Infrastructure Overhaul
**Goal:** Eliminate inline test data and brittle selectors

**Tasks:**
- Create `src/tests/fixtures/test-data-factory.ts`
- Create `src/tests/helpers/selectors.ts`
- Refactor all tests to use factories and selectors
- Add visual regression tests
- Add data structure snapshot tests
- Add performance benchmarks

**Implementation:** See `guides/test-infrastructure.md`

**Acceptance:**
- Zero inline test data in specs
- Zero inline selectors in tests
- Visual regression baseline established
- Performance benchmarks green

**Commit:** `test(infra): establish test data factories and selector patterns`

---

### M3: Code Quality Standards
**Goal:** Automated quality gates with <10 lint warnings

**Tasks:**
- Add ESLint config (`.eslintrc.json`)
- Add Prettier config (`.prettierrc.json`)
- Add JSDoc type checking (`jsconfig.json`)
- Create `quality-check.sh` script
- Fix existing lint warnings (target: <10)

**Implementation:** See `guides/code-quality-setup.md`

**Acceptance:**
- `npm run lint` passes with <10 warnings
- `npm run format:check` passes
- Quality check script integrated

**Commit:** `chore(quality): add linting, formatting, and type checking`

---

### M4: Observability & Debugging
**Goal:** Structured logging and diagnostic tools

**Tasks:**
- Create `dist/js/logger.js` (structured logging)
- Create `dist/diagnostic.html` (health dashboard)
- Integrate Logger into main.js (state mutations, validations, errors)
- Replace console.log with categorized logging

**Implementation:** See `guides/observability-setup.md`

**Acceptance:**
- All state mutations logged
- Diagnostic dashboard functional
- Logs exportable for agent analysis
- <5 console.log remain (debug only)

**Commit:** `feat(observability): add structured logging and diagnostic dashboard`

---

### M5: Agent Coordination Enhancements
**Goal:** Proposal validation and consistency checking

**Tasks:**
- Ensure Proposal Validator Agent exists (`proposal-validator.Agent.md`)
- Create `consistency-check.js` script
- Update orchestrator with validation workflow
- Test validation with sample proposals

**Implementation:** See `guides/agent-coordination.md`
**Reference:** `app/.prompts/proposal-validator.Agent.md` (standalone spec)

**Acceptance:**
- Consistency checker detects all drift patterns
- Proposal validator integrated into orchestrator
- Zero proposals applied without validation

**Commit:** `feat(agents): add proposal validation and consistency checking`

---

### M6: Development Workflow Automation
**Goal:** Pre-commit hooks and CI/CD pipelines

**Tasks:**
- Setup Husky for pre-commit hooks
- Create pre-commit script (consistency + quality checks)
- Add GitHub Actions workflows (`.github/workflows/agent-validation.yml`)
- Configure automated test runs
- Add performance regression detection

**Implementation:** See `guides/workflow-automation.md`

**Acceptance:**
- Pre-commit hooks prevent drift
- CI/CD validates all PRs
- Performance regressions auto-detected

**Commit:** `ci(automation): add pre-commit hooks and CI/CD pipelines`

---

## Success Metrics

### Agent Efficiency
- **Context Discovery:** 50% reduction (10k → 5k tokens)
- **Proposal Accuracy:** 90% first-try success rate
- **Coordination Overhead:** <20% of development time

### Code Quality
- **Test Coverage:** >85% UI interactions
- **Lint Warnings:** <10 total
- **Documentation:** 100% public APIs

### Development Velocity
- **Human First Contribution:** <30 min (clone to PR)
- **Agent First Proposal:** <5 min (invocation to proposal)
- **Bug Fix Cycle:** <2 hours (report to PR)

### Reliability
- **Test Flakiness:** <1% flaky rate
- **Schema Drift:** 0 incidents per quarter
- **Breaking Changes:** 0 unintentional

## Non-Goals

- **Runtime Performance:** No changes to app performance (test/build perf only)
- **New Features:** No calculator or planner features
- **UI Changes:** No visual changes (except diagnostic dashboard)
- **Migration from v4:** Purely additive infrastructure

## Testing Strategy

All milestones validated with:
1. **Automated Consistency Checks:** `consistency-check.js` green
2. **Code Quality Gates:** ESLint + Prettier pass
3. **Full Test Suite:** Existing Playwright tests green
4. **New Tests:** Visual regression, snapshots, performance benchmarks green
5. **Manual:** Orchestrator completes v4 M2 using new infra

## Documentation Updates

- **CLAUDE.md:** Add agent guidance, link to guides
- **README.md:** Add "For Agents" section
- **New: CONTRIBUTING.md:** Human and agent contributor guide
- **New: app/adr/*.md:** Architecture Decision Records
- **Updated: orchestrator.Agent.md:** Context efficiency protocol

## Migration from v4

**For Orchestrator:**
1. Complete v4.1 M1-M6 on branch `feat/code-quality-foundation`
2. No conflicts with v4 (purely additive)
3. Merge to `feat/orchestrated-transition` after M6
4. Re-run v4 M2-M7 using new infrastructure to validate

**For Future Development:**
- All features use test data factories
- All functions require `@agent-summary`
- All proposals validated by Proposal Validator
- Pre-commit hooks enforce quality

## Orchestrator Integration

**Enhanced Decision Tree:**

```
Milestone Start
  ↓
Load PRD v4.1 core (~3k tokens)
  ↓
Identify milestone (e.g., M2)
  ↓
Load guides/test-infrastructure.md (~4k tokens)
  ↓
Invoke Proposal Validator Agent
  ↓
Invoke specialized agents (dist/src/schema)
  ↓
Proposal Validator validates proposals
  ↓ APPROVED → Continue
  ↓ NEEDS_REVISION → Request revisions (max 2 rounds)
  ↓ REJECTED → Escalate
  ↓
Run consistency-check.js
  ↓ PASS → Apply patches
  ↓ FAIL → Auto-fix or escalate
  ↓
Run quality-check.sh
  ↓ PASS → Run tests
  ↓ FAIL → Fix or escalate
  ↓
Tests
  ↓ PASS → Commit
  ↓ FAIL → Test Fixer Agent
```

See: `app/.prompts/orchestrator.Agent.md` (updated with context efficiency protocol)

## File Structure After v4.1

```
visualsubnetcalc/
├── app/
│   ├── .prompts/
│   │   ├── BuildingProject.PRD.v4.md
│   │   ├── BuildingProject.PRD.v4.1.md (this file, slim)
│   │   ├── orchestrator.Agent.md (updated)
│   │   ├── dist.Agent.md, src.Agent.md, schema-manager.Agent.md, test-fixer.Agent.md
│   │   ├── proposal-validator.Agent.md (new)
│   │   ├── codebase-map.md (existing)
│   │   └── guides/ (new)
│   │       ├── README.md (index)
│   │       ├── documentation-standards.md (~3k tokens)
│   │       ├── test-infrastructure.md (~4k tokens)
│   │       ├── code-quality-setup.md (~3k tokens)
│   │       ├── observability-setup.md (~3k tokens)
│   │       ├── agent-coordination.md (~3k tokens)
│   │       └── workflow-automation.md (~3k tokens)
│   ├── adr/ (new, created in M1)
│   │   ├── 001-global-state-management.md
│   │   ├── 002-dist-as-source-of-truth.md
│   │   ├── 003-sqlite-wasm-persistence.md
│   │   ├── 004-playwright-e2e-testing.md
│   │   ├── 005-agent-orchestration.md
│   │   └── 006-schema-migration-strategy.md
│   └── database-schema.md
├── dist/
│   ├── diagnostic.html (new, M4)
│   ├── js/
│   │   ├── logger.js (new, M4)
│   │   ├── main.js (documented in M1)
│   │   └── planner-db.js (documented in M1)
│   └── ... (existing files)
├── src/
│   ├── .eslintrc.json (new, M3)
│   ├── .prettierrc.json (new, M3)
│   ├── jsconfig.json (new, M3)
│   ├── scripts/
│   │   ├── consistency-check.js (new, M5)
│   │   └── quality-check.sh (new, M3)
│   ├── tests/
│   │   ├── fixtures/
│   │   │   └── test-data-factory.ts (new, M2)
│   │   ├── helpers/
│   │   │   └── selectors.ts (new, M2)
│   │   ├── visual-regression.spec.ts (new, M2)
│   │   ├── snapshot-tests.spec.ts (new, M2)
│   │   ├── performance.spec.ts (new, M2)
│   │   └── ... (existing, refactored in M2)
│   └── package.json (updated with new scripts)
├── .husky/
│   └── pre-commit (new, M6)
├── .github/
│   └── workflows/
│       └── agent-validation.yml (new, M6)
├── CLAUDE.md (updated)
├── CONTRIBUTING.md (new)
└── README.md (updated)
```

## Quick Reference for Agents

**Starting a milestone?**
1. Orchestrator loads this PRD (~3k tokens)
2. Orchestrator loads relevant guide from `guides/` (~3k tokens)
3. Agent receives guide context, not full PRD
4. **Total: ~6k tokens (vs 30k for monolithic PRD)**

**Need implementation details?**
- See milestone-specific guide in `app/.prompts/guides/`
- Each guide: <1000 lines, ~3-4k tokens
- Orchestrator loads ONLY what's needed

**Need code navigation?**
- See `codebase-map.md` for function locations
- Grep before reading files (saves 70% context)

**Need architectural context?**
- See ADRs in `app/adr/` (created in M1)
- Each ADR documents one major decision

---

**End of PRD v4.1 Core**

**Token Budget:** ~3k tokens (this file only)
**Total with Guide:** ~6-7k tokens per milestone (80% savings vs monolithic)
