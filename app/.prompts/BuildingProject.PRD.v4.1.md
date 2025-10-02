# Visual Subnet Calculator — Code Quality & Agent-Readiness PRD (v4.1)

**Status:** Draft - Foundation for Agent-Driven Development
**Branch:** feat/code-quality-foundation
**Last Updated:** 2025-10-01
**Supersedes:** PRD v4 (feature development focus)

## Executive Summary

PRD v4.1 establishes the infrastructure necessary for seamless agent-driven development of the Visual Subnet Calculator. While v4 focused on feature delivery (planner database, VLAN/VRF management, undo/redo), **v4.1 focuses on code quality, documentation, and testing infrastructure** to enable future autonomous development by AI agents and efficient onboarding of human developers.

### Core Objectives

1. **Agent-Optimized Documentation:** Comprehensive inline documentation, architectural decision records, and agent-specific guides
2. **Test Infrastructure Excellence:** Expanded test coverage, test data factories, snapshot testing, and automated validation
3. **Code Quality Standards:** Linting, formatting, type safety, and automated quality gates
4. **Observability & Debugging:** Enhanced logging, error tracking, and diagnostic tooling for both agents and humans
5. **Development Workflow Automation:** CI/CD integration, automated fixes, and agent coordination protocols

## Background: Why v4.1?

The v4 implementation demonstrated successful agent orchestration but revealed key challenges:

- **Context Discovery:** Agents spent significant tokens searching for relevant code
- **Schema Drift:** Inconsistencies between code, tests, and documentation
- **Test Brittleness:** Selector changes broke tests; no systematic approach to robust selectors
- **Limited Observability:** Difficult to diagnose failures in agent-applied changes
- **Knowledge Gaps:** Critical architectural decisions not documented; agents repeatedly rediscovered patterns

**v4.1 solves these issues** by creating machine-readable documentation, automated consistency checks, and robust testing patterns.

## Architecture Enhancements

### 1. Documentation Structure (Machine-First, Human-Friendly)

#### A. Code Documentation Standards

**Inline Documentation Format:**
```javascript
/**
 * @agent-summary: Renders the subnet table from subnetMap state
 * @complexity: HIGH (2800+ lines, stateful, side effects)
 * @dependencies: subnetMap, subnetNotes, operatingMode
 * @side-effects: Mutates DOM (#calcbody), triggers planner snapshot persistence
 * @test-coverage: subnet-basic.spec.ts, ui-usage.spec.ts
 * @last-modified: 2025-09-29 (M7 - XML export)
 *
 * Key functions:
 * - renderTable(): Main entry point
 * - _renderRow(cidr, subnet, depth): Recursive row builder
 * - _attachEventHandlers(): Delegate click handlers for dynamic rows
 *
 * Agent notes:
 * - Use Grep to find functions before proposing changes
 * - Test changes with npm test -- tests/subnet-basic.spec.ts
 * - Check isHydratingFromSnapshot flag to avoid re-render loops
 */
function renderTable() {
  // implementation
}
```

**File-Level Metadata (Header Comments):**
```javascript
/**
 * FILE: dist/js/main.js
 * PURPOSE: Primary application logic for Visual Subnet Calculator
 * AGENT-ROLE: dist agent (see app/.prompts/dist.Agent.md)
 * LINES: 2800+
 * LAST-MAJOR-REFACTOR: 2025-09-29 (M6 - undo/redo)
 *
 * ARCHITECTURE:
 * - State: Global objects (subnetMap, subnetNotes, historyStack)
 * - Rendering: jQuery DOM manipulation, delegated event handlers
 * - Persistence: SQLite via planner-db.js + URL compression via lz-string
 *
 * KEY PATTERNS:
 * - mutate_subnet_map(action, cidr, data, value): State mutation primitive
 * - saveHistorySnapshot(action, description): Undo/redo integration
 * - schedulePlannerSnapshotPersist(): Debounced DB writes
 *
 * AGENT GUIDANCE:
 * - Read incrementally: Use Grep for function/variable search
 * - Preserve patterns: Follow existing mutate_subnet_map usage
 * - Test rigorously: Full test suite (npm test) after changes
 * - Coordinate: Set requiresSrc:true if tests need updates
 */
```

#### B. Architectural Decision Records (ADRs)

**New Directory:** `app/adr/` (Architecture Decision Records)

```markdown
# ADR-001: Global State Management via Plain Objects

**Status:** Accepted
**Date:** 2025-09-20
**Deciders:** Original developers, Orchestrator Agent

## Context
Visual Subnet Calculator requires managing hierarchical subnet state with frequent updates and re-renders.

## Decision
Use plain JavaScript objects (`subnetMap`, `subnetNotes`) as global state instead of frameworks (React, Vue) or state management libraries (Redux, MobX).

## Rationale
- **Simplicity:** No build step, no transpilation
- **Debuggability:** State visible in console (`window.subnetMap`)
- **Performance:** Direct object mutations faster than immutable updates for deep trees
- **Compatibility:** Works with jQuery event delegation

## Consequences
- **Positive:** Low complexity, easy for agents to understand and modify
- **Negative:** No built-in reactivity; must manually call `renderTable()` after state changes
- **Mitigation:** Centralized mutation via `mutate_subnet_map()` ensures consistency

## Agent Implications
- **Always use `mutate_subnet_map()`** for state changes to ensure re-renders and persistence
- **Check `isHydratingFromSnapshot` flag** before mutations to avoid re-render loops
- **Test state changes** with round-trip persistence (snapshot save/load tests)
```

**Additional ADRs to Create:**
- ADR-002: Dist as Source of Truth (not build artifact)
- ADR-003: SQLite WASM for Client-Side Persistence
- ADR-004: Playwright for E2E Testing (not Jest/unit tests)
- ADR-005: Agent Orchestration Model
- ADR-006: Schema Migration Strategy

#### C. Agent Navigation Maps

**New File:** `app/.prompts/codebase-map.md`

```markdown
# Codebase Navigation Map for Agents

## Quick Reference: Where to Find Things

### UI Components
- **Subnet Table Rendering:** `dist/js/main.js:400-800` (renderTable, _renderRow)
- **Database Controls:** `dist/index.html:150-200` (Create/Open/Save buttons)
- **Import/Export Modal:** `dist/index.html:500-650`
- **Operating Mode Selector:** `dist/index.html:80-100`

### State Management
- **Global State:** `dist/js/main.js:1-50` (subnetMap, subnetNotes, historyStack)
- **State Mutations:** `dist/js/main.js:1200-1300` (mutate_subnet_map)
- **History/Undo:** `dist/js/main.js:1600-1750` (saveHistorySnapshot, undo, redo)

### Database Layer
- **SQLite Manager:** `dist/js/planner-db.js:1-500` (PlannerDbManager class)
- **Migrations:** `dist/js/planner-db.js:50-200` (MIGRATIONS object, runMigrations)
- **Snapshot Persistence:** `dist/js/main.js:1450-1550` (persistPlannerSnapshot, hydratePlannerFromSnapshot)

### Validation & Business Logic
- **VLAN Validation:** `dist/js/main.js:900-950`
- **Gateway Validation:** `dist/js/main.js:950-1000`
- **Operating Mode Rules:** `dist/js/main.js:50-62` (minSubnetSizes, netsizePatterns)
- **Subnet Math:** `dist/js/main.js:2000-2400` (IP calculations, CIDR parsing)

### Testing
- **Basic Operations:** `src/tests/subnet-basic.spec.ts`
- **Database Features:** `src/tests/planner-basics.spec.ts`, `src/tests/planner-snapshot.spec.ts`
- **UI Interactions:** `src/tests/ui-usage.spec.ts`, `src/tests/ui-error-handling.spec.ts`
- **Persistence:** `src/tests/import-export.spec.ts`, `src/tests/url-sharing.spec.ts`
- **Export Features:** `src/tests/planner-export.spec.ts`
- **Regression Tests:** `src/tests/bug-fixes.spec.ts`

## Common Agent Tasks & Where to Start

### Task: Add new subnet metadata field
1. **Schema:** `dist/js/planner-db.js` - Add column to planner_subnet (migration N+1)
2. **State:** `dist/js/main.js:260` - Add field to hydratePlannerFromSnapshot
3. **Persistence:** `dist/js/main.js:1488` - Add field to persistPlannerSnapshot
4. **UI:** `dist/index.html` + `dist/js/main.js` - Add input field to subnet rows
5. **Tests:** `src/tests/planner-snapshot.spec.ts` - Add round-trip test
6. **Docs:** `app/database-schema.md` - Document new column

### Task: Add new validation rule
1. **Logic:** `dist/js/main.js` - Add validation function (follow gateway/VLAN pattern)
2. **UI Feedback:** `dist/js/main.js` - Add error message display
3. **Tests:** Create new spec or extend `ui-error-handling.spec.ts`
4. **Docs:** Update CLAUDE.md with new constraint

### Task: Fix test failure
1. **Diagnose:** `src/test-results/results.json` - Parse failure details
2. **Invoke:** Test Fixer Agent (app/.prompts/test-fixer.Agent.md)
3. **Apply:** Orchestrator applies HIGH confidence fixes
4. **Validate:** Re-run tests, escalate if still failing

### Task: Add new operating mode (e.g., GCP)
1. **Constants:** `dist/js/main.js:50-62` - Add to minSubnetSizes, netsizePatterns
2. **Reserved IPs:** `dist/js/main.js` - Update reservedIPLogic function
3. **UI:** `dist/index.html` - Add radio button for GCP mode
4. **Tests:** `src/tests/subnet-basic.spec.ts` - Add GCP mode tests
5. **Docs:** Update CLAUDE.md and README.md

## Function Index (Searchable)

Use Grep with these patterns to quickly locate functions:

- **State Mutations:** `function mutate_subnet_map`
- **Rendering:** `function renderTable`, `function _renderRow`
- **Database:** `class PlannerDbManager`, `function persistPlannerSnapshot`
- **Validation:** `function isGatewayValidForSubnet`, `function validateVlanUniqueness`
- **History:** `function saveHistorySnapshot`, `function undo`, `function redo`
- **Export:** `function exportPlannerToXml`, `function exportToJson`
- **Import:** `function importFromJson`, `function importFromUrl`
```

### 2. Test Infrastructure Overhaul

#### A. Test Data Factory System

**New File:** `src/tests/fixtures/test-data-factory.ts`

```typescript
/**
 * Test Data Factory
 * Provides consistent, reusable test data for all specs
 *
 * @agent-usage: Import and use factories instead of inline test data
 * @benefits: DRY, consistency, easier maintenance
 */

export class SubnetFactory {
  static simpleNetwork() {
    return {
      baseNetwork: '10.0.0.0/16',
      mode: 'Standard',
      subnets: [
        { cidr: '10.0.0.0/24', note: 'DMZ', color: '#e3f2fd', vlan: 100 },
        { cidr: '10.0.1.0/24', note: 'Internal', color: '#f3e5f5', vlan: 101 }
      ]
    };
  }

  static complexHierarchy() {
    return {
      baseNetwork: '172.16.0.0/12',
      mode: 'AWS',
      subnets: [
        { cidr: '172.16.0.0/16', note: 'Production VPC', vlan: 1000, vrf: 1,
          children: [
            { cidr: '172.16.0.0/24', note: 'Web Tier', vlan: 1001, gateway: '172.16.0.1' },
            { cidr: '172.16.1.0/24', note: 'App Tier', vlan: 1002, gateway: '172.16.1.1' },
            { cidr: '172.16.2.0/24', note: 'DB Tier', vlan: 1003, gateway: '172.16.2.1' }
          ]
        }
      ]
    };
  }

  static vrfTestData() {
    return {
      vrfs: [
        { id: 1, name: 'GLOBAL' },
        { id: 2, name: 'MGMT' },
        { id: 3, name: 'PROD' },
        { id: 4, name: 'DEV' }
      ]
    };
  }

  static edgeCases() {
    return {
      maxDepth: { baseNetwork: '10.0.0.0/8', depth: 10 }, // Deep nesting
      maxVlans: Array.from({ length: 4094 }, (_, i) => i + 1), // VLAN limit
      invalidGateways: ['10.0.0.0', '10.0.0.255', 'invalid'], // Boundary cases
      emptyNotes: ['', '   ', '\n\n'] // Whitespace handling
    };
  }
}

export class DatabaseFixture {
  static async createDbWithVersion(page: any, version: number) {
    // Helper to create DB at specific schema version for migration tests
    await page.evaluate((v) => {
      const mgr = window.plannerDbManager;
      mgr.db.exec(`PRAGMA user_version = ${v};`);
    }, version);
  }

  static async seedSampleData(page: any, fixture: string) {
    const data = SubnetFactory[fixture]();
    await page.evaluate((d) => {
      // Seed logic here
    }, data);
  }
}
```

#### B. Visual Regression Testing

**New File:** `src/tests/visual-regression.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { SubnetFactory } from './fixtures/test-data-factory';

/**
 * Visual Regression Tests
 * Validates UI consistency across changes
 *
 * @agent-note: Update snapshots with --update-snapshots flag after intentional UI changes
 */

test.describe('Visual Regression', () => {
  test('subnet table layout - simple network', async ({ page }) => {
    await page.goto('https://localhost:8443');

    const data = SubnetFactory.simpleNetwork();
    await page.fill('#network', data.baseNetwork.split('/')[0]);
    await page.fill('#netsize', data.baseNetwork.split('/')[1]);
    await page.click('#btn_go');

    // Snapshot entire subnet table
    const table = page.locator('#calcbody');
    await expect(table).toHaveScreenshot('subnet-table-simple.png');
  });

  test('database controls panel', async ({ page }) => {
    await page.goto('https://localhost:8443');

    const panel = page.locator('.planner-db-controls');
    await expect(panel).toHaveScreenshot('db-controls.png');
  });

  test('color palette rendering', async ({ page }) => {
    await page.goto('https://localhost:8443');

    const palette = page.locator('#color_palette');
    await expect(palette).toHaveScreenshot('color-palette.png');
  });
});
```

#### C. Performance Benchmarking Tests

**New File:** `src/tests/performance.spec.ts`

```typescript
/**
 * Performance Benchmark Tests
 * Validates rendering and persistence performance targets from PRD
 *
 * @agent-note: Fail if performance regresses beyond thresholds
 */

test.describe('Performance Benchmarks', () => {
  test('subnet tree with 1000 nodes renders < 500ms', async ({ page }) => {
    await page.goto('https://localhost:8443');

    // Generate 1000-node tree
    const startTime = Date.now();
    await page.evaluate(() => {
      // Generate large subnetMap
    });
    await page.waitForSelector('#calcbody tr:nth-child(1000)');
    const endTime = Date.now();

    const renderTime = endTime - startTime;
    expect(renderTime).toBeLessThan(500);
  });

  test('SQLite snapshot persist < 100ms', async ({ page }) => {
    // Benchmark persistPlannerSnapshot
  });

  test('File System Access write < 200ms', async ({ page }) => {
    // Benchmark saveDatabase flow
  });
});
```

#### D. Test Selector Strategy

**New File:** `src/tests/helpers/selectors.ts`

```typescript
/**
 * Centralized Test Selectors
 * Provides stable, semantic selectors for UI elements
 *
 * @agent-usage: ALWAYS use these selectors in tests, never inline
 * @benefits: Single point of update when UI changes
 */

export const Selectors = {
  // Inputs
  networkInput: '#network',
  netsizeInput: '#netsize',
  submitButton: '#btn_go',

  // Subnet Table
  subnetTable: '#calcbody',
  subnetRow: (cidr: string) => `tr[data-subnet="${cidr}"]`,
  subnetNote: (cidr: string) => `.note[data-subnet="${cidr}"]`,
  splitButton: (cidr: string) => `.split-link[data-subnet="${cidr}"]`,
  joinButton: (cidr: string) => `.join-link[data-subnet="${cidr}"]`,

  // Database Controls
  createDbButton: 'button:has-text("Create Database")',
  openDbButton: 'button:has-text("Open Database")',
  saveDbButton: 'button:has-text("Save")',
  downloadDbButton: 'button:has-text("Download")',

  // Metadata Inputs (M2+)
  vlanInput: (cidr: string) => `input.vlan-input[data-subnet="${cidr}"]`,
  gatewayInput: (cidr: string) => `input.gateway-input[data-subnet="${cidr}"]`,
  vrfDropdown: (cidr: string) => `select.vrf-select[data-subnet="${cidr}"]`,

  // History Controls
  undoButton: '#btn-undo',
  redoButton: '#btn-redo',

  // Export
  exportXmlButton: 'button:has-text("Export to XML")',
  exportJsonButton: 'button:has-text("Export to JSON")'
};

// Usage in tests:
// await page.click(Selectors.splitButton('10.0.0.0/24'));
```

#### E. Snapshot Testing for Data Structures

**New File:** `src/tests/snapshot-tests.spec.ts`

```typescript
/**
 * Data Structure Snapshot Tests
 * Validates serialization formats remain consistent
 *
 * @agent-note: Update snapshots when data formats intentionally change
 */

test.describe('Data Snapshots', () => {
  test('subnetMap serialization format', async ({ page }) => {
    const data = SubnetFactory.simpleNetwork();
    // ... setup

    const subnetMap = await page.evaluate(() => window.subnetMap);
    expect(subnetMap).toMatchSnapshot('subnetMap-simple.json');
  });

  test('planner_subnet DB rows format', async ({ page }) => {
    // ... setup

    const rows = await page.evaluate(() => {
      return window.plannerDbManager.all('SELECT * FROM planner_subnet ORDER BY id');
    });
    expect(rows).toMatchSnapshot('planner-subnet-rows.json');
  });

  test('XML export structure', async ({ page }) => {
    // ... setup

    const xml = await page.evaluate(() => window.exportPlannerToXml());
    expect(xml).toMatchSnapshot('planner-export.xml');
  });
});
```

### 3. Code Quality & Static Analysis

#### A. ESLint Configuration

**New File:** `src/.eslintrc.json`

```json
{
  "env": {
    "browser": true,
    "es2021": true,
    "jquery": true
  },
  "extends": "eslint:recommended",
  "parserOptions": {
    "ecmaVersion": 12,
    "sourceType": "script"
  },
  "rules": {
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-console": "off",
    "prefer-const": "warn",
    "no-var": "warn",
    "eqeqeq": ["error", "always"],
    "curly": ["error", "all"],
    "brace-style": ["error", "1tbs"],
    "max-lines": ["warn", { "max": 3000, "skipBlankLines": true, "skipComments": true }],
    "complexity": ["warn", 20]
  },
  "globals": {
    "LZString": "readonly",
    "plannerDbManager": "writable"
  }
}
```

**New File:** `src/.eslintignore`
```
node_modules/
dist/js/lz-string.min.js
dist/js/*.min.js
playwright-report/
test-results/
```

#### B. Prettier Configuration

**New File:** `src/.prettierrc.json`

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "always"
}
```

#### C. TypeScript for Type Checking (no compilation)

**New File:** `src/jsconfig.json`

```json
{
  "compilerOptions": {
    "checkJs": true,
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "noEmit": true,
    "strict": false,
    "moduleResolution": "node"
  },
  "include": ["../dist/js/**/*.js"],
  "exclude": ["node_modules", "../dist/js/*.min.js"]
}
```

**Benefits:**
- VS Code provides IntelliSense for jQuery, DOM APIs
- JSDoc type annotations enable type checking without TypeScript compilation
- Agents can validate types before proposing changes

#### D. Automated Code Quality Gates

**New File:** `src/scripts/quality-check.sh`

```bash
#!/bin/bash
# Quality Gate Script
# Run before commits to ensure standards

set -e

echo "🔍 Running ESLint..."
npx eslint ../dist/js/main.js ../dist/js/planner-db.js --max-warnings 10

echo "🎨 Running Prettier check..."
npx prettier --check "../dist/**/*.{js,html,css}"

echo "📊 Checking complexity..."
npx eslint ../dist/js/main.js --rule 'complexity: [error, 20]' --no-eslintrc

echo "✅ Quality checks passed!"
```

### 4. Observability & Debugging

#### A. Structured Logging System

**New File:** `dist/js/logger.js`

```javascript
/**
 * Structured Logging for Visual Subnet Calculator
 * Provides consistent, filterable logs for debugging
 *
 * @agent-usage: Use Logger.info(), Logger.warn(), Logger.error() instead of console.log()
 */

class Logger {
  static LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
  static currentLevel = Logger.LOG_LEVELS.INFO;

  static _log(level, category, message, data = {}) {
    if (Logger.LOG_LEVELS[level] < Logger.currentLevel) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      ...data
    };

    const prefix = `[${level}] [${category}]`;

    switch (level) {
      case 'DEBUG': console.debug(prefix, message, data); break;
      case 'INFO': console.info(prefix, message, data); break;
      case 'WARN': console.warn(prefix, message, data); break;
      case 'ERROR': console.error(prefix, message, data); break;
    }

    // Store in session for diagnostics
    if (!window.logBuffer) window.logBuffer = [];
    window.logBuffer.push(logEntry);
    if (window.logBuffer.length > 1000) window.logBuffer.shift();
  }

  static debug(category, message, data) { Logger._log('DEBUG', category, message, data); }
  static info(category, message, data) { Logger._log('INFO', category, message, data); }
  static warn(category, message, data) { Logger._log('WARN', category, message, data); }
  static error(category, message, data) { Logger._log('ERROR', category, message, data); }

  static exportLogs() {
    return JSON.stringify(window.logBuffer || [], null, 2);
  }
}

// Usage examples:
// Logger.info('STATE_MUTATION', 'Subnet map updated', { cidr: '10.0.0.0/24', action: 'split' });
// Logger.warn('VALIDATION', 'VLAN collision detected', { vlan: 100, conflictingSubnets: [...] });
// Logger.error('DATABASE', 'Snapshot persist failed', { error: e.message, stack: e.stack });
```

#### B. Diagnostic Dashboard

**New File:** `dist/diagnostic.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Visual Subnet Calculator - Diagnostics</title>
  <style>
    body { font-family: monospace; padding: 20px; }
    .metric { margin: 10px 0; padding: 10px; border: 1px solid #ccc; }
    .error { background: #ffebee; }
    .warn { background: #fff3e0; }
  </style>
</head>
<body>
  <h1>Visual Subnet Calculator - Diagnostic Dashboard</h1>

  <h2>System Health</h2>
  <div id="health"></div>

  <h2>Database Status</h2>
  <div id="db-status"></div>

  <h2>State Summary</h2>
  <div id="state-summary"></div>

  <h2>Recent Logs (Last 100)</h2>
  <div id="logs"></div>

  <button onclick="exportDiagnostics()">Export Diagnostics JSON</button>

  <script src="js/logger.js"></script>
  <script src="js/planner-db.js"></script>
  <script>
    // Diagnostic logic
    async function loadDiagnostics() {
      const health = {
        subnetMapSize: Object.keys(window.parent.subnetMap || {}).length,
        historyStackSize: window.parent.historyStack?.length || 0,
        dbInitialized: !!window.parent.plannerDbManager,
        mode: window.parent.operatingMode || 'Unknown'
      };

      document.getElementById('health').innerHTML = JSON.stringify(health, null, 2);

      if (window.parent.plannerDbManager) {
        const dbDiag = await window.parent.plannerDbManager.getDiagnostics();
        document.getElementById('db-status').innerHTML = JSON.stringify(dbDiag, null, 2);
      }

      const logs = window.parent.logBuffer || [];
      document.getElementById('logs').innerHTML = logs.slice(-100).map(log =>
        `<div class="${log.level.toLowerCase()}">${log.timestamp} [${log.category}] ${log.message}</div>`
      ).join('');
    }

    function exportDiagnostics() {
      const diagnostics = {
        timestamp: new Date().toISOString(),
        health: { /* ... */ },
        database: { /* ... */ },
        logs: window.parent.logBuffer || []
      };

      const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diagnostics-${Date.now()}.json`;
      a.click();
    }

    loadDiagnostics();
    setInterval(loadDiagnostics, 5000); // Refresh every 5s
  </script>
</body>
</html>
```

### 5. Agent Coordination Enhancements

#### A. Enhanced Proposal Validation

**New File:** `app/.prompts/proposal-validator.Agent.md`

```markdown
# Proposal Validator Agent

**Role:** Validates agent proposals for consistency, completeness, and risk

## Mission

Before Orchestrator applies any agent proposal, validate:
1. **Schema Consistency:** No drift between code/tests/docs
2. **Test Coverage:** Changes include corresponding test updates
3. **Breaking Changes:** Flag API changes, data format changes
4. **Performance Impact:** Estimate rendering/persistence impact
5. **Rollback Plan:** Ensure reversibility

## Validation Checklist

### For Schema Changes (Schema Manager proposals)
- [ ] Migration version incremented correctly
- [ ] New columns have DEFAULT or migration logic for existing data
- [ ] Foreign keys have appropriate CASCADE rules
- [ ] Indices added for new query patterns
- [ ] database-schema.md updated
- [ ] Tests expect new schema version
- [ ] Snapshot helpers serialize new fields

### For UI Changes (Dist Agent proposals)
- [ ] ARIA labels added/updated
- [ ] Selectors.ts includes new selectors (if applicable)
- [ ] Event handlers use delegation pattern
- [ ] State mutations use mutate_subnet_map()
- [ ] Tests cover new UI elements
- [ ] Visual regression snapshots updated (--update-snapshots flag documented)

### For Test Changes (Src Agent proposals)
- [ ] Uses test data factories (not inline data)
- [ ] Uses centralized selectors from selectors.ts
- [ ] Includes positive and negative cases
- [ ] Performance tests if applicable
- [ ] Snapshot tests if data format changes

## Validation Output Format

```json
{
  "proposalId": "dist-M2-vlan-ui",
  "agent": "dist",
  "validationStatus": "APPROVED" | "REJECTED" | "NEEDS_REVISION",
  "checks": {
    "schemaConsistency": { "pass": true, "notes": "" },
    "testCoverage": { "pass": false, "notes": "Missing negative test for VLAN 0" },
    "breakingChanges": { "pass": true, "notes": "Additive only" },
    "performanceImpact": { "pass": true, "notes": "Minimal - single input field" },
    "rollbackPlan": { "pass": true, "notes": "Revert UI changes, no DB migration" }
  },
  "requiredRevisions": [
    "Add test case for VLAN ID 0 (invalid)",
    "Document VLAN range (1-4094) in inline comment"
  ],
  "riskAssessment": "LOW",
  "approvalRecommendation": "APPROVE after revisions"
}
```
```

#### B. Automated Consistency Checker

**New File:** `src/scripts/consistency-check.js`

```javascript
/**
 * Automated Consistency Checker
 * Validates code/test/doc alignment
 *
 * @agent-usage: Run before commits, invoked by orchestrator
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
    const codeVersion = parseInt(targetVersionMatch[1]);

    // 2. Extract version from database-schema.md
    const schemaMd = fs.readFileSync(path.join(__dirname, '../../app/database-schema.md'), 'utf-8');
    const docVersionMatch = schemaMd.match(/Schema Version (\d+)/);
    const docVersion = parseInt(docVersionMatch[1]);

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
    // Validate all tests use centralized selectors
    const testFiles = fs.readdirSync(path.join(__dirname, '../tests'))
      .filter(f => f.endsWith('.spec.ts'));

    for (const file of testFiles) {
      const content = fs.readFileSync(path.join(__dirname, '../tests', file), 'utf-8');

      // Check for inline selectors (anti-pattern)
      const inlineSelectors = content.match(/page\.(click|fill|locator)\(['"]#[^'"]+['"]\)/g);
      if (inlineSelectors && !content.includes('import { Selectors }')) {
        this.warnings.push(`${file} uses inline selectors, should import Selectors`);
      }
    }
  }

  async checkDocumentation() {
    // Ensure all major functions documented
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

      // Check sequential
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

### 6. Development Workflow Automation

#### A. Pre-commit Hooks

**New File:** `.husky/pre-commit`

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "🔍 Running pre-commit checks..."

# Consistency checks
cd src && node scripts/consistency-check.js
if [ $? -ne 0 ]; then
  echo "❌ Consistency check failed. Fix errors before committing."
  exit 1
fi

# Code quality
npm run lint
if [ $? -ne 0 ]; then
  echo "❌ Linting failed. Fix errors before committing."
  exit 1
fi

# Format check
npm run format:check
if [ $? -ne 0 ]; then
  echo "❌ Code not formatted. Run 'npm run format' to fix."
  exit 1
fi

echo "✅ Pre-commit checks passed!"
```

#### B. CI/CD Integration

**New File:** `.github/workflows/agent-validation.yml`

```yaml
name: Agent Validation Pipeline

on:
  push:
    branches: [ feat/*, main ]
  pull_request:
    branches: [ main ]

jobs:
  consistency-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: cd src && npm ci
      - run: cd src && node scripts/consistency-check.js
      - name: Upload consistency report
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: consistency-report
          path: src/consistency-report.json

  code-quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: cd src && npm ci
      - run: cd src && npm run lint
      - run: cd src && npm run format:check

  test-suite:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: cd src && npm ci
      - run: cd src && npx playwright install --with-deps
      - run: cd src && npm run build
      - run: cd src && npm test
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: src/playwright-report/

  performance-benchmarks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: cd src && npm ci
      - run: cd src && npx playwright install --with-deps
      - run: cd src && npm run test:performance
      - name: Comment performance results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('src/performance-results.json'));
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## Performance Benchmark Results\n\n${results.summary}`
            });
```

## Milestones for v4.1

### M1: Documentation Infrastructure
**Goal:** Establish machine-readable documentation system

**Tasks:**
1. Add JSDoc `@agent-*` annotations to all major functions in `dist/js/main.js`
2. Create file-level headers with architecture summaries
3. Write ADRs 001-006 in `app/adr/`
4. Create `app/.prompts/codebase-map.md`
5. Update CLAUDE.md with agent-specific guidance

**Acceptance:**
- 100% of public functions have `@agent-summary`
- All ADRs reviewed and approved
- Codebase map navigates to all key areas
- Agents can locate code 50% faster (measured by token usage)

**Commit:** `docs(agents): add machine-readable documentation infrastructure`

### M2: Test Infrastructure Overhaul
**Goal:** Establish robust, maintainable test patterns

**Tasks:**
1. Create `src/tests/fixtures/test-data-factory.ts`
2. Refactor all tests to use factories (no inline data)
3. Create `src/tests/helpers/selectors.ts`
4. Migrate all tests to centralized selectors
5. Add visual regression tests (`visual-regression.spec.ts`)
6. Add snapshot tests (`snapshot-tests.spec.ts`)
7. Add performance benchmarks (`performance.spec.ts`)

**Acceptance:**
- Zero inline test data in specs
- Zero inline selectors in tests
- Visual regression baseline established
- Performance benchmarks green

**Commit:** `test(infra): establish test data factories and selector patterns`

### M3: Code Quality Standards
**Goal:** Enforce automated quality gates

**Tasks:**
1. Add ESLint config with agent-friendly rules
2. Add Prettier config
3. Add `jsconfig.json` for type checking
4. Create `quality-check.sh` script
5. Fix all existing lint warnings (max 10 allowed)
6. Document quality standards in CLAUDE.md

**Acceptance:**
- `npm run lint` passes with <10 warnings
- `npm run format:check` passes
- Quality check script integrated into workflow

**Commit:** `chore(quality): add linting, formatting, and type checking`

### M4: Observability & Debugging
**Goal:** Enable effective debugging for agents and humans

**Tasks:**
1. Create `dist/js/logger.js` structured logging
2. Integrate Logger into `main.js` (state mutations, validations, errors)
3. Create `dist/diagnostic.html` dashboard
4. Add log export functionality
5. Document logging patterns in ADR-007

**Acceptance:**
- All state mutations logged
- Diagnostic dashboard functional
- Logs exportable for agent analysis

**Commit:** `feat(observability): add structured logging and diagnostic dashboard`

### M5: Agent Coordination Enhancements
**Goal:** Improve agent proposal quality and validation

**Tasks:**
1. Create Proposal Validator Agent (`proposal-validator.Agent.md`)
2. Create `consistency-check.js` script
3. Integrate consistency checks into orchestrator workflow
4. Add validation gates to orchestrator decision tree
5. Document proposal validation in orchestrator.Agent.md

**Acceptance:**
- Consistency checker detects all known drift patterns
- Proposal validator integrated into orchestrator
- Zero proposals applied without validation

**Commit:** `feat(agents): add proposal validation and consistency checking`

### M6: Development Workflow Automation
**Goal:** Streamline agent-driven and human development

**Tasks:**
1. Setup Husky for pre-commit hooks
2. Create pre-commit script (consistency + quality checks)
3. Add CI/CD workflows (`.github/workflows/agent-validation.yml`)
4. Configure automated test runs
5. Add performance regression detection
6. Document workflow in CONTRIBUTING.md (new file)

**Acceptance:**
- Pre-commit hooks prevent drift
- CI/CD validates all PRs
- Performance regressions auto-detected

**Commit:** `ci(automation): add pre-commit hooks and CI/CD pipelines`

## Success Metrics

### Agent Efficiency
- **Context Discovery Time:** 50% reduction in tokens spent searching for code
- **Proposal Accuracy:** 90% of HIGH confidence proposals succeed first try
- **Coordination Overhead:** <20% of development time spent on agent coordination

### Code Quality
- **Test Coverage:** >85% of UI interactions covered
- **Lint Warnings:** <10 across entire codebase
- **Documentation Coverage:** 100% of public APIs documented with `@agent-summary`

### Development Velocity
- **Time to First Contribution (Human):** <30 minutes from clone to PR
- **Time to First Contribution (Agent):** <5 minutes from invocation to proposal
- **Bug Fix Cycle Time:** <2 hours from report to PR

### Reliability
- **Test Flakiness:** <1% flaky test rate
- **Schema Drift Incidents:** 0 per quarter
- **Breaking Changes:** 0 unintentional breaking changes

## Non-Goals for v4.1

- **Runtime Performance:** No changes to application performance (only test/build perf)
- **New Features:** No new calculator or planner features
- **UI Changes:** No visual or UX changes (except diagnostic dashboard)
- **Migration from v4:** No schema or data migrations (purely additive infrastructure)

## Testing Strategy

All milestones tested with:

1. **Automated Consistency Checks:** `consistency-check.js` green
2. **Code Quality Gates:** ESLint + Prettier pass
3. **Full Test Suite:** Existing Playwright tests remain green
4. **New Test Infrastructure:** Visual regression, snapshots, performance benchmarks green
5. **Manual Validation:** Orchestrator can successfully complete M2 from PRD v4 using new infra

## Documentation Updates

- **CLAUDE.md:** Add agent-specific guidance, link to codebase-map.md, document quality standards
- **README.md:** Add "For Agents" section, link to orchestrator.Agent.md
- **New: CONTRIBUTING.md:** Guide for human and agent contributors
- **New: app/adr/*.md:** Architecture Decision Records
- **New: app/.prompts/codebase-map.md:** Navigation guide
- **Updated: orchestrator.Agent.md:** Integrate proposal validation, consistency checks

## Migration Path from v4

**For Orchestrator:**
1. Complete v4.1 M1-M6 on new branch `feat/code-quality-foundation`
2. No conflicts with v4 feature work (purely additive)
3. Merge to `feat/orchestrated-transition` after M6
4. Re-run v4 M2-M7 using new infrastructure to validate

**For Future Development:**
- All new features must use test data factories
- All new functions require `@agent-summary`
- All proposals validated by Proposal Validator Agent
- Pre-commit hooks enforce quality

## Appendix A: Agent File Summary

### Existing Agents (Enhanced)
- `orchestrator.Agent.md` - Add proposal validation integration
- `dist.Agent.md` - Add documentation requirements
- `src.Agent.md` - Add test pattern requirements
- `schema-manager.Agent.md` - Add consistency check integration
- `test-fixer.Agent.md` - No changes needed

### New Agents
- `proposal-validator.Agent.md` - Validates agent proposals before application

## Appendix B: File Tree After v4.1

```
visualsubnetcalc/
├── app/
│   ├── .prompts/
│   │   ├── BuildingProject.PRD.v4.md
│   │   ├── BuildingProject.PRD.v4.1.md ← NEW
│   │   ├── orchestrator.Agent.md (updated)
│   │   ├── dist.Agent.md (updated)
│   │   ├── src.Agent.md (updated)
│   │   ├── schema-manager.Agent.md (updated)
│   │   ├── test-fixer.Agent.md
│   │   ├── proposal-validator.Agent.md ← NEW
│   │   └── codebase-map.md ← NEW
│   ├── adr/ ← NEW
│   │   ├── 001-global-state-management.md
│   │   ├── 002-dist-as-source-of-truth.md
│   │   ├── 003-sqlite-wasm-persistence.md
│   │   ├── 004-playwright-e2e-testing.md
│   │   ├── 005-agent-orchestration.md
│   │   ├── 006-schema-migration-strategy.md
│   │   └── 007-structured-logging.md
│   └── database-schema.md (updated)
├── dist/
│   ├── diagnostic.html ← NEW
│   ├── js/
│   │   ├── logger.js ← NEW
│   │   ├── main.js (documented)
│   │   └── planner-db.js (documented)
│   └── ... (existing files)
├── src/
│   ├── .eslintrc.json ← NEW
│   ├── .eslintignore ← NEW
│   ├── .prettierrc.json ← NEW
│   ├── jsconfig.json ← NEW
│   ├── scripts/
│   │   ├── consistency-check.js ← NEW
│   │   └── quality-check.sh ← NEW
│   ├── tests/
│   │   ├── fixtures/
│   │   │   └── test-data-factory.ts ← NEW
│   │   ├── helpers/
│   │   │   └── selectors.ts ← NEW
│   │   ├── visual-regression.spec.ts ← NEW
│   │   ├── snapshot-tests.spec.ts ← NEW
│   │   ├── performance.spec.ts ← NEW
│   │   └── ... (existing, refactored)
│   └── package.json (updated with new scripts)
├── .husky/
│   └── pre-commit ← NEW
├── .github/
│   └── workflows/
│       └── agent-validation.yml ← NEW
├── CLAUDE.md (updated)
├── CONTRIBUTING.md ← NEW
└── README.md (updated)
```

## Appendix C: Orchestrator Integration Points

### Enhanced Decision Tree

```
Milestone Start
  ↓
Parse requirements
  ↓
Invoke Proposal Validator Agent
  ↓
Receive validation checklist
  ↓
Invoke specialized agents (dist/src/schema)
  ↓
Receive proposals
  ↓
Proposal Validator validates proposals
  ↓ APPROVED → Continue
  ↓ NEEDS_REVISION → Request revisions
  ↓ REJECTED → Escalate to human
  ↓
Run consistency-check.js
  ↓ PASS → Continue
  ↓ FAIL → Auto-fix or escalate
  ↓
Apply patches
  ↓
Run quality-check.sh
  ↓ PASS → Continue
  ↓ FAIL → Auto-fix or escalate
  ↓
Run tests
  ↓ PASS → Commit
  ↓ FAIL → Invoke Test Fixer Agent
```

---

**End of PRD v4.1**
