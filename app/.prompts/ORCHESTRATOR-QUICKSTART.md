# Orchestrator Quickstart Guide

**Last Updated:** 2025-10-01
**Branch:** feat/orchestrated-transition
**Current State:** M0 + M1 + M1.5 + M2 + M3 + M4 + M6 + M7 complete (112/120 tests passing, 8 pre-existing failures)
**Next Milestone:** COMPLETE - All PRD v4 milestones implemented (M5 deferred to PRD v5)

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
- If `"M1.5: Schema Reconciliation & Cleanup"` → Next is **M2 (VLAN/Gateway/VRF UI & Validation)**
- If `"M2: Enhanced Subnet Metadata & Validation"` → Next is **M3 (Remove URL Sharing)**
- If `"M3: Remove URL Sharing"` → Next is **M4 (Save/Load Workflow Polish)**
- If `"M4"` or `"M6"` → Next is **M7 (XML Export)** [CURRENTLY HERE]

### 3. Execute Milestone Workflow

Follow `orchestrator.Agent.md` Phase 1-5:

**Phase 1: Planning**
```
1. Parse M3 requirements from PRD v4
2. Identify agents needed:
   - dist Agent (remove URL serialization logic from main.js and lz-string from index.html)
   - src Agent (remove/gut url-sharing.spec.ts, update README.md)
3. Generate task list in dependency order
4. Use TodoWrite to track tasks
```

**Phase 2: Implementation**
```
5. Invoke dist Agent:
   Input: "Remove URL hash serialization logic and lz-string references from dist/js/main.js and dist/index.html"
   Expect: JSON proposal with removals
6. Invoke src Agent:
   Input: "Delete/gut url-sharing.spec.ts and update README.md to reflect file-based persistence only"
   Expect: JSON proposal with test/doc changes
7. Validate proposals for conflicts
8. Apply changes using Edit tool
```

**Phase 3: Validation**
```
9. Run: cd src && npm test (ensure no tests depend on URL logic)
10. Parse: src/test-results/results.json
11. Verify no regressions in remaining tests
```

**Phase 4: Recovery or Commit**
```
12. If PASS:
    - git add [changed files]
    - git commit -m "refactor(persistence): remove URL sharing and lz-string dependency"
    - Update .orchestrator-state.json
    - Append to .orchestrator-notes.md
    - Update ORCHESTRATOR-QUICKSTART.md
    - Proceed to M4
13. If FAIL:
    - Invoke Test Fixer with failure output
    - Apply HIGH confidence fixes (max 2)
    - Re-test
    - If still failing → ESCALATE
```

**Phase 5: State Persistence**
```
14. Write .orchestrator-state.json with new milestone
15. Append completion evidence to .orchestrator-notes.md
16. Update ORCHESTRATOR-QUICKSTART.md current state and next milestone
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
- Milestone: M2
- Agent invocations: dist Agent (success), src Agent (success), Test Fixer (2 failures)
- Current commit: aaaa171
- Failing tests: planner-snapshot.spec.ts (VLAN validation), subnet-basic.spec.ts (UI regression)

**Applied Fixes:**
1. Attempt 1: Updated test to expect v3 → still failing (new error)
2. Attempt 2: Fixed data serialization bug → still failing (same error)

**Diagnostic Info:**
- Test output: [attach stderr]
- Git diff since last green: [attach diff]
- Schema state: v3, TARGET_VERSION=3

**Request:**
Human review of VLAN validation logic and test expectations.
Possible UI regression in subnet calculator after adding new fields.

**Next Steps (upon resolution):**
- Apply human-provided fix
- Resume with: npm test
- If green → commit M2 and proceed to M3
```

## Success Metrics (Track Per Session)

- **Milestones completed:** Count (target: 1-2 per session)
- **Agent invocations:** Count (aim: <5 per milestone)
- **Test fix attempts:** Count (aim: <2 per milestone)
- **Context tokens used:** Sum (aim: <50k per milestone)
- **Escalations:** Count (aim: 0 per session)

**M2 Session Results:**
- Milestones completed: 1 (M2)
- Agent invocations: 2 (dist Agent for analysis, src Agent for tests)
- Test fix attempts: 1 (selector and assertion fixes)
- Context tokens used: ~89k (high due to agent task invocations and file reads)
- Escalations: 0
- **Key Learning:** Check for existing implementations before building new features

## Common Pitfalls to Avoid

❌ **Don't write code directly** → Always delegate to specialized agents
❌ **Don't commit without tests green** → Exception: WIP commits on escalation only
❌ **Don't skip schema consistency checks** → Invoke Schema Manager for validation
❌ **Don't apply LOW confidence fixes automatically** → Escalate instead
❌ **Don't batch-commit multiple milestones** → One milestone = one commit
❌ **Don't forget to update ORCHESTRATOR-QUICKSTART.md** → Update after each milestone completion
✅ **DO check for existing implementations** → Use Grep/Read to analyze code before invoking agents

## File Modification Matrix

| Agent | Can Modify | Cannot Modify |
|-------|-----------|---------------|
| Schema Manager | `dist/js/planner-db.js` (migrations), `app/database-schema.md` | dist UI, src tests |
| dist Agent | `dist/js/main.js`, `dist/index.html`, `dist/css/main.css` | src tests, build scripts |
| src Agent | `src/tests/*.spec.ts`, `src/package.json`, `src/playwright.config.ts`, `README.md` | dist runtime code |
| Test Fixer | Any file (via proposals) | Nothing (never applies directly) |
| Orchestrator | Git operations, state files (`.orchestrator-*`, `ORCHESTRATOR-QUICKSTART.md`) | Agent-owned files (delegate instead) |

## Next Session Checklist

Before starting next session:

- [x] Read `.orchestrator-state.json` to determine current milestone → **M2 complete, next is M3**
- [x] Check git status for uncommitted changes → **Clean (commits: 630a6b2, 4dadd72)**
- [x] Verify branch is `feat/orchestrated-transition` → **Confirmed**
- [x] Review `.orchestrator-notes.md` last entry for any blockers → **No blockers, M2 green**
- [ ] Load PRD v4 to understand M3 requirements → **Next: Remove URL Sharing**
- [ ] Identify agents needed for M3 → **dist Agent (remove URL logic), src Agent (remove tests/update docs)**
- [ ] Begin Phase 1 (Planning) → **Ready to start M3**

## Emergency Recovery

If orchestrator state is corrupted or lost:

1. Check git log: `git log --oneline -10`
2. Last conventional commit indicates last completed milestone
3. Reconstruct state from commit messages and `app/.prompts/.orchestrator-notes.md`
4. Resume from next milestone in PRD v4 sequence

---

**Ready to proceed?** Load context files and begin Phase 1 for next milestone.