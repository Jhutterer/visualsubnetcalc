# Documentation Standards Guide

**Milestone:** M1
**Token Budget:** ~3k
**Agent Owner:** dist (for code docs), all agents (for ADRs)

## Overview

Establish machine-readable documentation that enables agents to quickly understand code architecture, locate relevant functions, and make informed changes without extensive searching.

**Goals:**
- JSDoc annotations with `@agent-*` tags on all public functions
- File-level architecture summaries
- Architecture Decision Records (ADRs) for major design choices
- Self-documenting code patterns

**Why This Matters:**
- Reduces agent context discovery time by 50-70%
- Prevents repeated "rediscovery" of architectural patterns
- Enables autonomous decision-making based on documented rationale

## JSDoc Annotation Patterns

### Function-Level Documentation

**Pattern:**
```javascript
/**
 * @agent-summary: [One-line description of what function does]
 * @complexity: [LOW|MEDIUM|HIGH] ([reason])
 * @dependencies: [comma-separated list of global dependencies]
 * @side-effects: [DOM mutations, state changes, async operations]
 * @test-coverage: [which test files cover this function]
 * @last-modified: [YYYY-MM-DD] ([milestone/feature that changed it])
 *
 * [Detailed description for humans]
 *
 * Agent notes:
 * - [Specific guidance for agents making changes]
 * - [Common pitfalls to avoid]
 * - [Testing requirements]
 */
function functionName(params) {
  // implementation
}
```

**Example (from dist/js/main.js):**
```javascript
/**
 * @agent-summary: Renders entire subnet table from subnetMap state
 * @complexity: HIGH (2800+ line file, recursive rendering, side effects)
 * @dependencies: subnetMap, subnetNotes, operatingMode, jQuery
 * @side-effects: Clears and rebuilds #calcbody DOM, triggers persistence debounce
 * @test-coverage: subnet-basic.spec.ts, ui-usage.spec.ts
 * @last-modified: 2025-09-29 (M7 - XML export)
 *
 * Main rendering function for subnet table. Recursively walks subnetMap tree
 * and builds HTML table rows with split/join controls, note inputs, and color indicators.
 *
 * Agent notes:
 * - Check isHydratingFromSnapshot flag before calling to avoid re-render loops
 * - Performance: Full re-render for >1000 subnets takes ~500ms (target)
 * - After changes, test with: npm test -- tests/subnet-basic.spec.ts
 * - Consider incremental rendering for future optimization
 */
function renderTable() {
  if (isHydratingFromSnapshot) return;

  $('#calcbody').empty();
  // ... implementation
}
```

### File-Level Headers

**Pattern:**
```javascript
/**
 * FILE: [path/to/file.js]
 * PURPOSE: [High-level purpose of this file]
 * AGENT-ROLE: [Which agent owns this file - dist|src|schema-manager]
 * LINES: [Approximate line count]
 * LAST-MAJOR-REFACTOR: [YYYY-MM-DD] ([What changed])
 *
 * ARCHITECTURE:
 * - [Key architectural pattern (e.g., "Global state via plain objects")]
 * - [Rendering approach (e.g., "jQuery DOM manipulation")]
 * - [Persistence mechanism]
 *
 * KEY PATTERNS:
 * - [Pattern 1]: [Brief description]
 * - [Pattern 2]: [Brief description]
 *
 * AGENT GUIDANCE:
 * - [How to search this file efficiently]
 * - [Required testing approach]
 * - [Coordination requirements]
 */
```

**Example (dist/js/planner-db.js):**
```javascript
/**
 * FILE: dist/js/planner-db.js
 * PURPOSE: SQLite WASM database manager for planner state persistence
 * AGENT-ROLE: dist + schema-manager
 * LINES: ~800
 * LAST-MAJOR-REFACTOR: 2025-09-27 (M1 - snapshot persistence)
 *
 * ARCHITECTURE:
 * - SQLite WASM (sql.js) running in browser
 * - File System Access API for local file persistence
 * - OPFS fallback, in-memory mode with download/upload
 * - Migration system (currently v3)
 *
 * KEY PATTERNS:
 * - PlannerDbManager.runMigrations(): Sequential migration execution
 * - Snapshot persistence: subnetMap → planner_subnet rows (flattened tree)
 * - File handle management: requestFileHandle(), saveDatabase()
 *
 * AGENT GUIDANCE:
 * - Schema changes: Always update TARGET_VERSION and add migration to MIGRATIONS object
 * - Test changes: Update planner-basics.spec.ts to expect new version
 * - Coordinate with schema-manager agent for migration authoring
 */
```

## Architecture Decision Records (ADRs)

### ADR Template

**File naming:** `app/adr/NNN-title-in-kebab-case.md` (e.g., `001-global-state-management.md`)

**Structure:**
```markdown
# ADR-NNN: [Decision Title]

**Status:** [Proposed|Accepted|Deprecated|Superseded]
**Date:** YYYY-MM-DD
**Deciders:** [Who made this decision]

## Context
[What is the issue or situation that requires a decision?]

## Decision
[What is the decision that was made?]

## Rationale
[Why was this decision made? What factors were considered?]

## Consequences

### Positive
- [Good outcome 1]
- [Good outcome 2]

### Negative
- [Tradeoff or limitation 1]
- [Tradeoff or limitation 2]

### Mitigations
[How are negative consequences addressed?]

## Agent Implications
[Specific guidance for agents working with this decision:]
- [What patterns to follow]
- [What to avoid]
- [How to validate adherence]

## Alternatives Considered
- **[Alternative 1]:** [Brief description] - Rejected because [reason]
- **[Alternative 2]:** [Brief description] - Rejected because [reason]

## References
- [Link to related code]
- [Link to discussion/PR]
```

### Required ADRs for v4.1

Create these ADRs in `app/adr/`:

1. **ADR-001: Global State Management via Plain Objects**
   - Decision: Use subnetMap/subnetNotes globals instead of frameworks
   - Rationale: Simplicity, debuggability, no build step
   - Agent implications: Always use mutate_subnet_map() for changes

2. **ADR-002: Dist as Source of Truth**
   - Decision: /dist is living source code, not build artifact
   - Rationale: Static site, no bundler, direct browser execution
   - Agent implications: Edit dist/js/main.js directly, not src/

3. **ADR-003: SQLite WASM for Client-Side Persistence**
   - Decision: Use sql.js for browser-based database
   - Rationale: No server needed, powerful queries, standard SQL
   - Agent implications: All schema changes via migrations

4. **ADR-004: Playwright for E2E Testing (No Unit Tests)**
   - Decision: E2E tests only, no Jest/Mocha unit tests
   - Rationale: UI-focused app, integration matters more
   - Agent implications: Test via browser automation, not isolated functions

5. **ADR-005: Agent Orchestration Model**
   - Decision: Specialized agents (dist/src/schema/test-fixer) coordinated by orchestrator
   - Rationale: Token efficiency, domain expertise, parallel execution
   - Agent implications: Proposals only, orchestrator executes

6. **ADR-006: Schema Migration Strategy**
   - Decision: Sequential migrations with TARGET_VERSION tracking
   - Rationale: Backward compatibility, rollback safety
   - Agent implications: Never drop columns, always provide DEFAULT for NOT NULL

## Implementation Checklist

### For dist Agent (Code Documentation)

- [ ] Add file-level header to `dist/js/main.js`
- [ ] Add file-level header to `dist/js/planner-db.js`
- [ ] Add `@agent-summary` to all functions in main.js (focus on public functions first)
- [ ] Add `@agent-summary` to PlannerDbManager methods
- [ ] Document all global state variables with inline comments
- [ ] Add complexity warnings for functions >100 lines

### For All Agents (ADR Creation)

- [ ] Create `app/adr/` directory
- [ ] Write ADR-001 through ADR-006 using template
- [ ] Review each ADR with proposal-validator agent
- [ ] Update CLAUDE.md to reference ADRs

### For Orchestrator (Documentation Validation)

- [ ] After docs added, run: `grep -r "@agent-summary" dist/js/`
- [ ] Verify all major functions documented (>20 functions in main.js)
- [ ] Check ADRs exist: `ls app/adr/` should show 6 files
- [ ] Update orchestrator state with documentation completion

## Validation

### Automated Checks
```bash
# Count documented functions
grep -c "@agent-summary" dist/js/main.js
# Should be: >20

# Verify ADRs created
ls app/adr/ | wc -l
# Should be: 6

# Check file headers present
grep -l "FILE:" dist/js/main.js dist/js/planner-db.js
# Should list both files
```

### Manual Validation
1. Open `dist/js/main.js` in editor
2. Navigate to random function
3. Verify `@agent-summary` present and helpful
4. Check `codebase-map.md` aligns with new docs

## Common Issues & Solutions

**Issue:** JSDoc too verbose, bloating file size
**Solution:** Keep @agent-summary to 1 line, detailed notes in separate section

**Issue:** ADRs duplicating codebase-map.md
**Solution:** ADRs explain "why" (decisions), codebase-map explains "where" (navigation)

**Issue:** Agents not reading documentation
**Solution:** Orchestrator must explicitly reference docs in agent invocation

## References

- [codebase-map.md](../codebase-map.md) - Navigation guide (complements these docs)
- [JSDoc specification](https://jsdoc.app/) - Standard JSDoc syntax
- [ADR templates](https://github.com/joelparkerhenderson/architecture-decision-record) - Community ADR examples

---

**Token Budget:** ~3k tokens
**Last Updated:** 2025-10-01
