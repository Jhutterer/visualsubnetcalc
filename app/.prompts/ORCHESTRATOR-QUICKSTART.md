# Orchestrator Quickstart Guide

**Last Updated:** 2025-09-29
**Branch:** feat/orchestrated-transition
**Current State:** M0 + M1 complete, tests failing (schema v2/v3 mismatch)

## How to Resume Work

When you (Orchestrator Agent) are invoked to continue work on this project:

### 1. Load Context (5 files, ~8k tokens)

```
Read in order:
1. app/.prompts/.orchestrator-state.json (current progress)
2. app/.prompts/BuildingProject.PRD.v4.md (requirements)
3. app/.prompts/orchestrator.Agent.md (your workflow)
4. app/.prompts/.orchestrator-notes.md (detailed history)
5. CLAUDE.md (project architecture)
```

### 2. Determine Current Milestone

Check `.orchestrator-state.json` → `lastMilestone` field:
- If `"M1"` → Next is **M1.5 (Schema Reconciliation)**
- If `"M1.5"` → Next is **M2 (VLAN/Gateway UI)**
- If `"M2"` → Next is **M3 (Remove URL Sharing)**
- etc.

### 3. Execute Milestone Workflow

Follow `orchestrator.Agent.md` Phase 1-5:

**Phase 1: Planning**
```
1. Parse M1.5 requirements from PRD v4
2. Identify agents needed:
   - Schema Manager (remove unused tables, update docs)
   - src Agent (fix test expectations)
   - Test Fixer (diagnose remaining failures)
3. Generate task list in dependency order
```

**Phase 2: Implementation**
```
4. Invoke Schema Manager:
   Input: "Remove tbl_building/tbl_device/etc. from migration v1, update database-schema.md"
   Expect: JSON proposal with migration changes and doc updates
5. Invoke src Agent:
   Input: "Update planner-basics.spec.ts:27 to expect userVersion=3"
   Expect: JSON proposal with test file diff
6. Validate proposals for conflicts
7. Apply changes using Edit tool
```

**Phase 3: Validation**
```
8. Run: cd src && npm run build (if dist changed)
9. Run: cd src && npm test -- tests/planner-basics.spec.ts
10. Parse: src/test-results/results.json
```

**Phase 4: Recovery or Commit**
```
11. If PASS:
    - git add [changed files]
    - git commit -m "refactor(schema): align DB migrations with actual usage and fix tests"
    - Update .orchestrator-state.json
    - Append to .orchestrator-notes.md
    - Proceed to M2
12. If FAIL:
    - Invoke Test Fixer with failure output
    - Apply HIGH confidence fixes (max 2)
    - Re-test
    - If still failing → ESCALATE
```

**Phase 5: State Persistence**
```
13. Write .orchestrator-state.json with new milestone
14. Append completion evidence to .orchestrator-notes.md
```

## Agent Invocation Patterns

### Sequential (dependencies exist)
```
Schema Manager → dist Agent → src Agent
Example: M2 needs schema verified before UI built, then tests written
```

### Parallel (no dependencies)
```
dist Agent + src Agent (simultaneously)
Example: M3 removes URL logic (dist) and test files (src) independently
```

### Test-Fix Loop
```
npm test → FAIL → Test Fixer Agent → apply fix → npm test → PASS
Budget: 2 attempts, then escalate
```

## Context Optimization Tips

1. **Don't read full files unless necessary**
   - Use Grep to find patterns first
   - Use Read with offset/limit for large files
   - Cache schema definitions from previous reads

2. **Batch agent invocations**
   - If M2 needs 3 dist changes, send all 3 tasks to dist Agent at once
   - Receive single JSON proposal with all changes

3. **Reuse test results**
   - Parse `src/test-results/results.json` once
   - Pass relevant failures to Test Fixer, don't make it re-read

4. **Lazy agent loading**
   - Don't invoke Schema Manager unless schema changes needed
   - Don't invoke Test Fixer unless tests actually fail

## Escalation Triggers

**PAUSE and request human input when:**

1. Test Fixer budget exhausted (2 attempts) and tests still failing
2. Schema Manager proposes breaking change (data loss risk)
3. Cross-agent proposals have conflicting file edits
4. Git operations fail (merge conflicts, authentication issues)
5. PRD requirements ambiguous or contradictory

**Escalation Format:**
```markdown
## ESCALATION: [Milestone] - [Issue Type]

**Status:** Tests failing after 2 fix attempts

**Context:**
- Milestone: M1.5
- Agent invocations: Schema Manager (success), src Agent (success), Test Fixer (2 failures)
- Current commit: abc1234
- Failing tests: planner-basics.spec.ts (schema version), planner-snapshot.spec.ts (data mismatch)

**Applied Fixes:**
1. Attempt 1: Updated test to expect v3 → still failing (new error)
2. Attempt 2: Fixed data serialization bug → still failing (same error)

**Diagnostic Info:**
- Test output: [attach stderr]
- Git diff since last green: [attach diff]
- Schema state: v3, TARGET_VERSION=3

**Request:**
Human review of test expectations vs actual schema implementation.
Possible schema logic bug in planner-db.js migrations.

**Next Steps (upon resolution):**
- Apply human-provided fix
- Resume with: npm test
- If green → commit M1.5 and proceed to M2
```

## Success Metrics (Track Per Session)

- **Milestones completed:** Count (target: 1-2 per session)
- **Agent invocations:** Count (aim: <5 per milestone)
- **Test fix attempts:** Count (aim: <2 per milestone)
- **Context tokens used:** Sum (aim: <50k per milestone)
- **Escalations:** Count (aim: 0 per session)

## Common Pitfalls to Avoid

❌ **Don't write code directly** → Always delegate to specialized agents
❌ **Don't commit without tests green** → Exception: WIP commits on escalation only
❌ **Don't skip schema consistency checks** → Invoke Schema Manager for validation
❌ **Don't apply LOW confidence fixes automatically** → Escalate instead
❌ **Don't batch-commit multiple milestones** → One milestone = one commit

## File Modification Matrix

| Agent | Can Modify | Cannot Modify |
|-------|-----------|---------------|
| Schema Manager | `dist/js/planner-db.js` (migrations), `app/database-schema.md` | dist UI, src tests |
| dist Agent | `dist/js/main.js`, `dist/index.html`, `dist/css/main.css` | src tests, build scripts |
| src Agent | `src/tests/*.spec.ts`, `src/package.json`, `src/playwright.config.ts` | dist runtime code |
| Test Fixer | Any file (via proposals) | Nothing (never applies directly) |
| Orchestrator | Git operations, state files (`.orchestrator-*`) | Agent-owned files (delegate instead) |

## Next Session Checklist

Before starting next session:

- [ ] Read `.orchestrator-state.json` to determine current milestone
- [ ] Check git status for uncommitted changes (shouldn't be any)
- [ ] Verify branch is `feat/orchestrated-transition`
- [ ] Review `.orchestrator-notes.md` last entry for any blockers
- [ ] Load PRD v4 to understand upcoming milestone
- [ ] Identify agents needed for next milestone
- [ ] Begin Phase 1 (Planning)

## Emergency Recovery

If orchestrator state is corrupted or lost:

1. Check git log: `git log --oneline -10`
2. Last conventional commit indicates last completed milestone
3. Reconstruct state from commit messages and `app/.prompts/.orchestrator-notes.md`
4. Resume from next milestone in PRD v4 sequence

---

**Ready to proceed?** Load context files and begin Phase 1 for next milestone.