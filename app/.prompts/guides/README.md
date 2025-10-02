# Implementation Guides Index

**Purpose:** Modular, token-efficient implementation guides for PRD v4.1 milestones
**Usage:** Orchestrator loads ONLY the relevant guide for current milestone
**Token Budget:** Each guide <1000 lines (~3-4k tokens)

## Guide Catalog

| Guide | Milestone | Token Cost | Purpose |
|-------|-----------|------------|---------|
| **documentation-standards.md** | M1 | ~3k | JSDoc patterns, ADRs, file headers, agent annotations |
| **test-infrastructure.md** | M2 | ~4k | Test factories, selectors, visual regression, snapshots |
| **code-quality-setup.md** | M3 | ~3k | ESLint, Prettier, quality gates, type checking |
| **observability-setup.md** | M4 | ~3k | Structured logging, diagnostic dashboard |
| **agent-coordination.md** | M5 | ~3k | Proposal validation, consistency checking |
| **workflow-automation.md** | M6 | ~3k | Pre-commit hooks, CI/CD, automation |

## Orchestrator Usage Pattern

### Context-Efficient Loading

```javascript
// Orchestrator reads PRD v4.1 core (~3k tokens)
const prd = await readFile('app/.prompts/BuildingProject.PRD.v4.1.md');
const currentMilestone = parseMilestone(prd); // "M2"

// Load ONLY relevant guide (~3k tokens)
const guideMap = {
  'M1': 'guides/documentation-standards.md',
  'M2': 'guides/test-infrastructure.md',
  'M3': 'guides/code-quality-setup.md',
  'M4': 'guides/observability-setup.md',
  'M5': 'guides/agent-coordination.md',
  'M6': 'guides/workflow-automation.md'
};

const guide = await readFile(`app/.prompts/${guideMap[currentMilestone]}`);

// Total context: ~6k tokens (vs 30k for bloated PRD)
// Savings: 80% reduction
```

### Example: Milestone M2 (Test Infrastructure)

**Orchestrator workflow:**
1. Read PRD v4.1 core → Identify M2 goal: "Establish test data factories and selectors"
2. Load `guides/test-infrastructure.md` → Get implementation patterns
3. Invoke src agent with guide context
4. Src agent creates test-data-factory.ts using patterns from guide
5. **Never loads M1, M3-M6 guides** → Saves ~15k tokens

## Guide Structure Template

Each guide follows this structure:

```markdown
# [Guide Name]

**Milestone:** MX
**Token Budget:** ~3k
**Agent Owner:** [primary agent]

## Overview (2-3 paragraphs)
High-level goal and rationale

## Implementation Patterns (code examples)
Concrete patterns agents should follow

## File Locations & Commands
Where to create files, what commands to run

## Validation Checklist
How to verify implementation

## Common Issues & Solutions
Troubleshooting guide

## References
Links to other docs, not embedded content
```

## Token Budget Breakdown

### Before (Bloated PRD v4.1)
- PRD core with all examples: **25-30k tokens**
- Orchestrator loads everything: **25-30k tokens**
- Agent receives everything: **25-30k tokens**
- **Total: 25-30k tokens per milestone**

### After (Modular Guides)
- PRD core (references only): **2-3k tokens**
- Milestone-specific guide: **3-4k tokens**
- Orchestrator loads: **5-7k tokens**
- Agent receives only relevant guide: **3-4k tokens**
- **Total: 5-7k tokens per milestone**
- **Savings: 80-85%**

## Maintenance Guidelines

### Adding a New Guide
1. Create guide file in `app/.prompts/guides/`
2. Follow template structure above
3. Keep under 1000 lines (~4k tokens)
4. Update this README with guide entry
5. Update PRD v4.1 milestone to reference new guide

### Updating Existing Guide
1. Ensure changes don't bloat token count
2. If guide exceeds 1000 lines, split into sub-guides
3. Update references in PRD v4.1 if structure changes

### Token Budget Violations
If guide exceeds 4k tokens:
- **Split into sub-guides** (e.g., `test-infrastructure-factories.md`, `test-infrastructure-selectors.md`)
- **Use more external references** (link to codebase-map.md instead of duplicating)
- **Remove redundant examples** (keep 1-2 examples max per pattern)

## Cross-Guide References

Guides can reference each other, but orchestrator loads selectively:

```markdown
<!-- In test-infrastructure.md -->
See [Code Quality Setup](code-quality-setup.md) for ESLint test file configuration.

<!-- Orchestrator behavior -->
// If on M2, orchestrator does NOT load code-quality-setup.md
// Agent gets reference, can request it if needed (rare)
```

## Agent Instructions

**When you receive a guide:**
1. Read it fully (already filtered for your milestone)
2. Follow patterns exactly as shown
3. Reference external docs (codebase-map.md) as needed
4. Don't request other guides unless milestone requires cross-guide coordination

**When proposing changes:**
1. Specify which guide sections are relevant
2. Include guide file path in proposal for orchestrator validation
3. Proposal validator checks guide compliance

## Quick Reference: Guide by Task

| Task | Load Guide(s) |
|------|---------------|
| Add JSDoc annotations | documentation-standards.md |
| Create test factory | test-infrastructure.md |
| Setup ESLint | code-quality-setup.md |
| Add structured logging | observability-setup.md |
| Validate proposal | agent-coordination.md |
| Setup pre-commit hook | workflow-automation.md |
| Add ADR | documentation-standards.md |
| Create visual regression test | test-infrastructure.md |
| Add performance benchmark | test-infrastructure.md |
| Setup CI/CD pipeline | workflow-automation.md |

---

**Last Updated:** 2025-10-01
**Maintainer:** Update when adding/modifying guides
