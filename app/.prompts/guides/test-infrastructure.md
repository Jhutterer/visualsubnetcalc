# Test Infrastructure Guide

**Milestone:** M2
**Token Budget:** ~4k
**Agent Owner:** src

## Overview

Establish robust, maintainable test patterns using factories, centralized selectors, visual regression, and snapshot testing. Eliminate inline test data and brittle selectors that break when UI changes.

**Goals:**
- Test data factories for DRY, consistent test data
- Centralized selectors (single point of update)
- Visual regression testing (screenshot snapshots)
- Data structure snapshot testing (JSON snapshots)
- Performance benchmarks

**Why This Matters:**
- Reduces test maintenance burden by 70%
- Prevents selector brittleness (UI changes don't break tests)
- Enables confident refactoring (visual/data snapshots catch regressions)

## Test Data Factories

### Pattern: Centralized Test Data

**File:** `src/tests/fixtures/test-data-factory.ts`

```typescript
/**
 * Test Data Factory
 * @agent-usage: Import and use factories instead of inline test data
 */

export class SubnetFactory {
  /**
   * Simple two-subnet network for basic tests
   */
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

  /**
   * Complex hierarchical tree for nested subnet tests
   */
  static complexHierarchy() {
    return {
      baseNetwork: '172.16.0.0/12',
      mode: 'AWS',
      subnets: [
        {
          cidr: '172.16.0.0/16',
          note: 'Production VPC',
          vlan: 1000,
          vrf: 1,
          children: [
            { cidr: '172.16.0.0/24', note: 'Web Tier', vlan: 1001, gateway: '172.16.0.1' },
            { cidr: '172.16.1.0/24', note: 'App Tier', vlan: 1002, gateway: '172.16.1.1' }
          ]
        }
      ]
    };
  }

  /**
   * Edge cases for validation testing
   */
  static edgeCases() {
    return {
      maxDepth: { baseNetwork: '10.0.0.0/8', depth: 10 }, // Deep nesting
      invalidGateways: ['10.0.0.0', '10.0.0.255', 'invalid'], // Boundary cases
      emptyNotes: ['', '   ', '\n\n'] // Whitespace handling
    };
  }
}

export class DatabaseFixture {
  /**
   * Create DB at specific schema version (for migration tests)
   */
  static async createDbWithVersion(page: any, version: number) {
    await page.evaluate((v) => {
      const mgr = window.plannerDbManager;
      mgr.db.exec(`PRAGMA user_version = ${v};`);
    }, version);
  }

  /**
   * Seed database with factory data
   */
  static async seedSampleData(page: any, fixtureName: string) {
    const data = SubnetFactory[fixtureName]();
    await page.evaluate((d) => {
      // Hydration logic
      window.subnetMap = d.subnets;
      window.operatingMode = d.mode;
      renderTable();
    }, data);
  }
}
```

### Usage in Tests

**Before (inline data, hard to maintain):**
```typescript
test('subnet split', async ({ page }) => {
  await page.fill('#network', '10.0.0.0');
  await page.fill('#netsize', '16');
  await page.click('#btn_go');
  // ... inline subnet creation
});
```

**After (factory, reusable):**
```typescript
import { SubnetFactory } from './fixtures/test-data-factory';

test('subnet split', async ({ page }) => {
  const data = SubnetFactory.simpleNetwork();
  await page.fill('#network', data.baseNetwork.split('/')[0]);
  await page.fill('#netsize', data.baseNetwork.split('/')[1]);
  await page.click('#btn_go');
  // ... test logic
});
```

## Centralized Selectors

### Pattern: Selector Object

**File:** `src/tests/helpers/selectors.ts`

```typescript
/**
 * Centralized Test Selectors
 * @agent-usage: ALWAYS use these selectors, never inline strings
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
```

### Usage in Tests

**Before (brittle, inline selectors):**
```typescript
test('split subnet', async ({ page }) => {
  await page.click('tr[data-subnet="10.0.0.0/24"] .split-link');
  // Breaks if class or structure changes
});
```

**After (robust, centralized):**
```typescript
import { Selectors } from './helpers/selectors';

test('split subnet', async ({ page }) => {
  await page.click(Selectors.splitButton('10.0.0.0/24'));
  // UI change? Update Selectors.ts once, all tests fixed
});
```

## Visual Regression Testing

### Pattern: Screenshot Snapshots

**File:** `src/tests/visual-regression.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { SubnetFactory } from './fixtures/test-data-factory';
import { Selectors } from './helpers/selectors';

test.describe('Visual Regression', () => {
  test('subnet table layout - simple network', async ({ page }) => {
    await page.goto('https://localhost:8443');

    const data = SubnetFactory.simpleNetwork();
    await page.fill(Selectors.networkInput, data.baseNetwork.split('/')[0]);
    await page.fill(Selectors.netsizeInput, data.baseNetwork.split('/')[1]);
    await page.click(Selectors.submitButton);

    // Snapshot entire subnet table
    const table = page.locator(Selectors.subnetTable);
    await expect(table).toHaveScreenshot('subnet-table-simple.png');
  });

  test('color palette rendering', async ({ page }) => {
    await page.goto('https://localhost:8443');

    const palette = page.locator('#color_palette');
    await expect(palette).toHaveScreenshot('color-palette.png');
  });
});
```

**Updating Snapshots:**
```bash
# After intentional UI changes, update snapshots:
npx playwright test --update-snapshots

# Agent note: Document snapshot updates in commit message
```

## Data Structure Snapshot Testing

### Pattern: JSON Snapshots

**File:** `src/tests/snapshot-tests.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { SubnetFactory, DatabaseFixture } from './fixtures/test-data-factory';

test.describe('Data Structure Snapshots', () => {
  test('subnetMap serialization format', async ({ page }) => {
    await page.goto('https://localhost:8443');

    const data = SubnetFactory.simpleNetwork();
    await DatabaseFixture.seedSampleData(page, 'simpleNetwork');

    const subnetMap = await page.evaluate(() => window.subnetMap);
    expect(subnetMap).toMatchSnapshot('subnetMap-simple.json');
  });

  test('planner_subnet DB rows format', async ({ page }) => {
    await page.goto('https://localhost:8443');
    await DatabaseFixture.seedSampleData(page, 'simpleNetwork');

    const rows = await page.evaluate(() => {
      return window.plannerDbManager.all('SELECT * FROM planner_subnet ORDER BY id');
    });

    expect(rows).toMatchSnapshot('planner-subnet-rows.json');
  });

  test('XML export structure', async ({ page }) => {
    await page.goto('https://localhost:8443');
    await DatabaseFixture.seedSampleData(page, 'simpleNetwork');

    const xml = await page.evaluate(() => window.exportPlannerToXml());
    expect(xml).toMatchSnapshot('planner-export.xml');
  });
});
```

**Agent Rule:** When data formats change, update snapshots and document reason in commit.

## Performance Benchmarking

### Pattern: Performance Tests

**File:** `src/tests/performance.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Performance Benchmarks', () => {
  test('subnet tree with 1000 nodes renders < 500ms', async ({ page }) => {
    await page.goto('https://localhost:8443');

    // Generate 1000-node tree
    await page.evaluate(() => {
      const baseNetwork = '10.0.0.0/8';
      // ... generate large subnetMap
    });

    const startTime = await page.evaluate(() => Date.now());
    await page.evaluate(() => renderTable());
    await page.waitForSelector('#calcbody tr:nth-child(1000)');
    const endTime = await page.evaluate(() => Date.now());

    const renderTime = endTime - startTime;
    expect(renderTime).toBeLessThan(500);
  });

  test('SQLite snapshot persist < 100ms', async ({ page }) => {
    await page.goto('https://localhost:8443');
    // ... setup large subnet tree

    const startTime = await page.evaluate(() => Date.now());
    await page.evaluate(() => window.persistPlannerSnapshot());
    const endTime = await page.evaluate(() => Date.now());

    const persistTime = endTime - startTime;
    expect(persistTime).toBeLessThan(100);
  });
});
```

**Run Performance Tests:**
```bash
npm test -- tests/performance.spec.ts
```

## Implementation Checklist

### For src Agent

- [ ] Create `src/tests/fixtures/test-data-factory.ts`
- [ ] Implement SubnetFactory with: simpleNetwork(), complexHierarchy(), edgeCases()
- [ ] Implement DatabaseFixture with: createDbWithVersion(), seedSampleData()
- [ ] Create `src/tests/helpers/selectors.ts`
- [ ] Define all UI element selectors (20+ selectors)
- [ ] Create `src/tests/visual-regression.spec.ts`
- [ ] Add 5+ visual regression tests for key UI areas
- [ ] Create `src/tests/snapshot-tests.spec.ts`
- [ ] Add data structure snapshot tests for subnetMap, DB rows, XML
- [ ] Create `src/tests/performance.spec.ts`
- [ ] Add benchmarks for rendering, persistence, file operations

### Refactor Existing Tests

- [ ] Update `subnet-basic.spec.ts` to use SubnetFactory
- [ ] Update `planner-snapshot.spec.ts` to use SubnetFactory and Selectors
- [ ] Update `ui-usage.spec.ts` to use Selectors
- [ ] Update `ui-error-handling.spec.ts` to use SubnetFactory
- [ ] Remove all inline test data
- [ ] Remove all hard-coded selectors

### For Orchestrator (Validation)

- [ ] Run: `grep -r "SubnetFactory" src/tests/*.spec.ts` (should find usage in all tests)
- [ ] Run: `grep -r "Selectors\." src/tests/*.spec.ts` (should find usage in all tests)
- [ ] Run: `grep -r "await page.click('#" src/tests/*.spec.ts` (should find NONE)
- [ ] Run: `npm test` (all tests green after refactor)
- [ ] Run: `npm test -- tests/visual-regression.spec.ts` (snapshots created)

## Validation

### Automated Checks
```bash
# Verify factories used (not inline data)
grep -c "SubnetFactory" src/tests/*.spec.ts
# Should be: >10 (used across multiple specs)

# Verify selectors used (not inline selectors)
grep -c "Selectors\." src/tests/*.spec.ts
# Should be: >30 (used frequently)

# Verify no inline selectors remain
grep -r "page.click('#" src/tests/*.spec.ts | wc -l
# Should be: 0 (all centralized)

# Run visual regression
npx playwright test tests/visual-regression.spec.ts
# Should create snapshots in src/tests/__screenshots__/

# Run performance benchmarks
npx playwright test tests/performance.spec.ts
# Should pass performance thresholds
```

## Common Issues & Solutions

**Issue:** Snapshot tests fail after UI changes
**Solution:** Expected behavior. Update snapshots with `--update-snapshots` and document why in commit

**Issue:** Performance benchmarks flaky (sometimes pass, sometimes fail)
**Solution:** Add warm-up runs, increase threshold slightly, or run in headed mode to debug

**Issue:** Test factories getting too large
**Solution:** Split into multiple factory files (e.g., `subnet-factory.ts`, `database-factory.ts`)

**Issue:** Selectors file hard to navigate (>100 selectors)
**Solution:** Group by component (InputSelectors, TableSelectors, ModalSelectors)

## References

- [Playwright Visual Comparisons](https://playwright.dev/docs/test-snapshots)
- [Playwright Selectors Best Practices](https://playwright.dev/docs/selectors)
- [Test Data Builders Pattern](https://www.petrikainulainen.net/programming/testing/test-data-builders-and-object-mother/)

---

**Token Budget:** ~4k tokens
**Last Updated:** 2025-10-01
