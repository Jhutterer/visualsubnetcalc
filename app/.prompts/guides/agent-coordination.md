# Agent Coordination Guide

**Milestone:** M5
**Token Budget:** ~3k
**Agent Owner:** All agents, orchestrator

## Overview

Enhance agent coordination through proposal validation and consistency checking. Prevent schema drift, ensure proposal quality, and automate cross-agent consistency verification.

**See:** `app/.prompts/proposal-validator.Agent.md` (standalone agent spec)

## Consistency Checker Script

**File:** `src/scripts/consistency-check.js`

```javascript
/**
 * Automated Consistency Checker
 * Validates code/test/doc alignment
 */
const fs = require('fs');
const path = require('path');

class ConsistencyChecker {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  async check() {
    await this.checkSchemaDrift();
    await this.checkTestSelectors();
    await this.checkDocumentation();
    await this.checkMigrationSequence();

    return {
      passed: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }

  async checkSchemaDrift() {
    // 1. Read TARGET_VERSION from planner-db.js
    const dbJs = fs.readFileSync(path.join(__dirname, '../../dist/js/planner-db.js'), 'utf-8');
    const targetVersionMatch = dbJs.match(/TARGET_VERSION\s*=\s*(\d+)/);
    const codeVersion = parseInt(targetVersionMatch?.[1] || 0);

    // 2. Extract version from database-schema.md
    const schemaMd = fs.readFileSync(path.join(__dirname, '../../app/database-schema.md'), 'utf-8');
    const docVersionMatch = schemaMd.match(/Schema Version (\d+)/);
    const docVersion = parseInt(docVersionMatch?.[1] || 0);

    if (codeVersion !== docVersion) {
      this.errors.push(`Schema drift: Code v${codeVersion}, Docs v${docVersion}`);
    }

    // 3. Check test expectations
    const testFiles = fs.readdirSync(path.join(__dirname, '../tests'))
      .filter(f => f.endsWith('.spec.ts'));

    for (const file of testFiles) {
      const content = fs.readFileSync(path.join(__dirname, '../tests', file), 'utf-8');
      const versionChecks = content.match(/expect\(.*userVersion.*\)\.toBe\((\d+)\)/g);
      if (versionChecks) {
        versionChecks.forEach(check => {
          const expectedVersion = parseInt(check.match(/toBe\((\d+)\)/)[1]);
          if (expectedVersion !== codeVersion) {
            this.errors.push(`${file} expects schema v${expectedVersion}, code is v${codeVersion}`);
          }
        });
      }
    }
  }

  async checkTestSelectors() {
    const testFiles = fs.readdirSync(path.join(__dirname, '../tests'))
      .filter(f => f.endsWith('.spec.ts'));

    for (const file of testFiles) {
      const content = fs.readFileSync(path.join(__dirname, '../tests', file), 'utf-8');
      const inlineSelectors = content.match(/page\.(click|fill|locator)\(['"]#[^'"]+['"]\)/g);
      if (inlineSelectors && !content.includes('import { Selectors }')) {
        this.warnings.push(`${file} uses inline selectors, should import Selectors`);
      }
    }
  }

  async checkDocumentation() {
    const mainJs = fs.readFileSync(path.join(__dirname, '../../dist/js/main.js'), 'utf-8');
    const functions = mainJs.match(/function\s+(\w+)/g) || [];

    functions.forEach(fnDecl => {
      const fnName = fnDecl.replace('function ', '');
      const docPattern = new RegExp(`/\\*\\*[\\s\\S]*?@agent-summary:[\\s\\S]*?\\*/\\s*function ${fnName}`);
      if (!docPattern.test(mainJs) && !fnName.startsWith('_')) {
        this.warnings.push(`Function ${fnName} missing @agent-summary documentation`);
      }
    });
  }

  async checkMigrationSequence() {
    const dbJs = fs.readFileSync(path.join(__dirname, '../../dist/js/planner-db.js'), 'utf-8');
    const migrationsMatch = dbJs.match(/MIGRATIONS\s*=\s*\{([^}]+)\}/s);

    if (migrationsMatch) {
      const migrations = migrationsMatch[1];
      const versions = [...migrations.matchAll(/(\d+):/g)].map(m => parseInt(m[1]));

      for (let i = 1; i < versions.length; i++) {
        if (versions[i] !== versions[i-1] + 1) {
          this.errors.push(`Migration gap: v${versions[i-1]} -> v${versions[i]}`);
        }
      }
    }
  }
}

// CLI usage
if (require.main === module) {
  const checker = new ConsistencyChecker();
  checker.check().then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.passed ? 0 : 1);
  });
}

module.exports = { ConsistencyChecker };
```

## Orchestrator Integration

**File:** `app/.prompts/orchestrator.Agent.md` (add section)

See "Update orchestrator.Agent.md with context efficiency protocol" task for full update.

**Key Integration Points:**

1. **Proposal Reception:** Orchestrator receives agent proposal
2. **Invoke Validator:** Call Proposal Validator Agent
3. **Consistency Check:** Run `src/scripts/consistency-check.js`
4. **Decision:**
   - APPROVED → Apply proposal
   - NEEDS_REVISION → Request agent revisions (max 2 rounds)
   - REJECTED → Escalate to human

## Validation Workflow

```
Agent submits proposal
  ↓
Proposal Validator Agent validates
  ↓
Consistency Checker runs
  ↓ ALL PASS → Apply
  ↓ FAIL → Request revision or escalate
```

## Implementation Checklist

- [ ] Create `src/scripts/consistency-check.js`
- [ ] Add consistency check to package.json: `"check:consistency": "node scripts/consistency-check.js"`
- [ ] Update orchestrator.Agent.md with validation integration
- [ ] Ensure proposal-validator.Agent.md exists (already created)
- [ ] Test: Run `npm run check:consistency` (should pass)

## Validation

```bash
# Run consistency check
cd src && npm run check:consistency
# Should exit 0 (all checks pass)

# Force a drift (test)
# Temporarily change TARGET_VERSION in planner-db.js
# Re-run: Should fail with error message

# Test proposal validation (manual)
# Invoke proposal-validator agent with sample proposal
# Verify validation report generated
```

---

**Token Budget:** ~2.5k tokens
**Last Updated:** 2025-10-01
