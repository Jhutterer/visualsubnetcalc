# Code Quality Setup Guide

**Milestone:** M3
**Token Budget:** ~3k
**Agent Owner:** src (config files), dist (code fixes)

## Overview

Establish automated code quality gates using ESLint, Prettier, and JSDoc type checking to maintain consistent code style and catch common errors before they reach production.

**Goals:**
- ESLint for code quality and pattern enforcement
- Prettier for consistent formatting
- JSDoc type checking (no TypeScript compilation)
- Automated quality check script
- <10 lint warnings total

## ESLint Configuration

**File:** `src/.eslintrc.json`

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
    "plannerDbManager": "writable",
    "Logger": "writable"
  }
}
```

**File:** `src/.eslintignore`

```
node_modules/
dist/js/lz-string.min.js
dist/js/*.min.js
playwright-report/
test-results/
```

### Agent-Friendly Rules

- **no-unused-vars: warn** - Don't block on unused vars (may be intentional during development)
- **complexity: 20** - Flag functions >20 cyclomatic complexity (refactor candidates)
- **max-lines: 3000** - Warn on large files (main.js grandfathered, no new large files)
- **eqeqeq: error** - Always use === (prevents type coercion bugs)

## Prettier Configuration

**File:** `src/.prettierrc.json`

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

**File:** `src/.prettierignore`

```
node_modules/
dist/js/*.min.js
playwright-report/
test-results/
```

## JSDoc Type Checking

**File:** `src/jsconfig.json`

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
- JSDoc type annotations enable type checking without compilation
- Catch type errors before runtime

**Usage in Code:**
```javascript
/**
 * @param {string} cidr - CIDR notation (e.g., "10.0.0.0/24")
 * @param {number} newSize - New subnet size (e.g., 25)
 * @returns {{network: string, broadcast: string}} Network info
 */
function splitSubnet(cidr, newSize) {
  // Type checking ensures cidr is string, newSize is number
  return { network: '...', broadcast: '...' };
}
```

## Quality Check Script

**File:** `src/scripts/quality-check.sh`

```bash
#!/bin/bash
# Quality Gate Script - Run before commits

set -e

echo "🔍 Running ESLint..."
npx eslint ../dist/js/main.js ../dist/js/planner-db.js --max-warnings 10

echo "🎨 Checking code formatting..."
npx prettier --check "../dist/**/*.{js,html,css}"

echo "📊 Checking complexity..."
npx eslint ../dist/js/main.js --rule 'complexity: [error, 25]' --no-eslintrc

echo "📝 Checking for TODOs and FIXMEs..."
grep -r "TODO\|FIXME" ../dist/js/*.js || echo "No TODOs found"

echo "✅ Quality checks passed!"
```

**Make executable:**
```bash
chmod +x src/scripts/quality-check.sh
```

## package.json Scripts

**File:** `src/package.json` (add to scripts section)

```json
{
  "scripts": {
    "lint": "eslint ../dist/js/main.js ../dist/js/planner-db.js",
    "lint:fix": "eslint ../dist/js/main.js ../dist/js/planner-db.js --fix",
    "format": "prettier --write \"../dist/**/*.{js,html,css}\"",
    "format:check": "prettier --check \"../dist/**/*.{js,html,css}\"",
    "quality": "./scripts/quality-check.sh",
    "type-check": "tsc --noEmit -p jsconfig.json"
  }
}
```

## Implementation Checklist

### For src Agent (Config Files)

- [ ] Create `src/.eslintrc.json`
- [ ] Create `src/.eslintignore`
- [ ] Create `src/.prettierrc.json`
- [ ] Create `src/.prettierignore`
- [ ] Create `src/jsconfig.json`
- [ ] Create `src/scripts/quality-check.sh`
- [ ] Update `src/package.json` with new scripts
- [ ] Install dev dependencies: `npm install --save-dev eslint prettier`

### For dist Agent (Code Fixes)

- [ ] Run `npm run lint` - identify warnings
- [ ] Fix high-priority warnings (unused vars, complexity)
- [ ] Run `npm run format` - auto-format code
- [ ] Add JSDoc type annotations to major functions
- [ ] Ensure <10 total warnings remain

### For Orchestrator (Validation)

- [ ] Run `cd src && npm run lint` (exit code 0, <10 warnings)
- [ ] Run `cd src && npm run format:check` (exit code 0)
- [ ] Run `cd src && npm run quality` (all checks pass)
- [ ] Run `cd src && npm run type-check` (no type errors)

## Validation

### Automated Checks
```bash
# Run full quality check
cd src && npm run quality
# Should exit 0

# Count remaining warnings
npx eslint ../dist/js/main.js ../dist/js/planner-db.js --format json | jq '.[] | .warningCount' | awk '{s+=$1} END {print s}'
# Should be: <10

# Verify formatting
npm run format:check
# Should exit 0
```

## Common Issues & Solutions

**Issue:** ESLint fails on jQuery global variables
**Solution:** Add to globals in .eslintrc.json: `"$": "readonly", "jQuery": "readonly"`

**Issue:** Too many warnings to fix at once
**Solution:** Gradually reduce max-warnings from 50 → 30 → 10 over multiple PRs

**Issue:** Prettier conflicts with existing code style
**Solution:** Run `npm run format` once to standardize, then enforce going forward

**Issue:** Type checking false positives
**Solution:** Add `// @ts-ignore` for specific lines, or adjust jsconfig strictness

## References

- [ESLint Rules](https://eslint.org/docs/latest/rules/)
- [Prettier Options](https://prettier.io/docs/en/options.html)
- [JSDoc Type Checking](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)

---

**Token Budget:** ~3k tokens
**Last Updated:** 2025-10-01
