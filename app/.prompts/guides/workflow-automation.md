# Workflow Automation Guide

**Milestone:** M6
**Token Budget:** ~3k
**Agent Owner:** src (CI/CD configs), all agents (pre-commit compliance)

## Overview

Automate development workflow with pre-commit hooks and CI/CD pipelines to enforce quality standards, prevent drift, and validate all changes before merge.

## Pre-commit Hooks (Husky)

**Setup:**
```bash
cd src
npm install --save-dev husky
npx husky install
```

**File:** `.husky/pre-commit`

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

## CI/CD Pipeline (GitHub Actions)

**File:** `.github/workflows/agent-validation.yml`

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
      - run: cd src && npm run build
      - run: cd src && npm run test:performance || true
      - name: Comment performance results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            if (fs.existsSync('src/performance-results.json')) {
              const results = JSON.parse(fs.readFileSync('src/performance-results.json'));
              github.rest.issues.createComment({
                issue_number: context.issue.number,
                owner: context.repo.owner,
                repo: context.repo.repo,
                body: `## Performance Benchmark Results\n\n${results.summary}`
              });
            }
```

## Implementation Checklist

- [ ] Install Husky: `cd src && npm install --save-dev husky`
- [ ] Initialize Husky: `npx husky install`
- [ ] Create `.husky/pre-commit` with checks
- [ ] Make pre-commit executable: `chmod +x .husky/pre-commit`
- [ ] Create `.github/workflows/agent-validation.yml`
- [ ] Update package.json with `"prepare": "husky install"` script
- [ ] Test pre-commit hook with intentional lint error
- [ ] Push to trigger CI/CD pipeline
- [ ] Verify all jobs pass in GitHub Actions

## Validation

```bash
# Test pre-commit hook locally
git add .
git commit -m "test: verify pre-commit hooks"
# Should run all checks before commit

# Test CI/CD (requires GitHub)
git push origin feat/code-quality-foundation
# Check GitHub Actions tab for pipeline status
```

---

**Token Budget:** ~2k tokens
**Last Updated:** 2025-10-01
