# Observability & Debugging Guide

**Milestone:** M4
**Token Budget:** ~3k
**Agent Owner:** dist

## Overview

Add structured logging and diagnostic tools to enable effective debugging for agents and humans. Replace console.log with categorized, filterable logs and create a diagnostic dashboard for health monitoring.

## Structured Logger Implementation

**File:** `dist/js/logger.js`

```javascript
/**
 * Structured Logging for Visual Subnet Calculator
 * @agent-usage: Use Logger.info/warn/error instead of console.log
 */
class Logger {
  static LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
  static currentLevel = Logger.LOG_LEVELS.INFO;

  static _log(level, category, message, data = {}) {
    if (Logger.LOG_LEVELS[level] < Logger.currentLevel) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level, category, message, ...data
    };

    const prefix = `[${level}] [${category}]`;
    switch (level) {
      case 'DEBUG': console.debug(prefix, message, data); break;
      case 'INFO': console.info(prefix, message, data); break;
      case 'WARN': console.warn(prefix, message, data); break;
      case 'ERROR': console.error(prefix, message, data); break;
    }

    if (!window.logBuffer) window.logBuffer = [];
    window.logBuffer.push(logEntry);
    if (window.logBuffer.length > 1000) window.logBuffer.shift();
  }

  static debug(cat, msg, data) { Logger._log('DEBUG', cat, msg, data); }
  static info(cat, msg, data) { Logger._log('INFO', cat, msg, data); }
  static warn(cat, msg, data) { Logger._log('WARN', cat, msg, data); }
  static error(cat, msg, data) { Logger._log('ERROR', cat, msg, data); }

  static exportLogs() {
    return JSON.stringify(window.logBuffer || [], null, 2);
  }
}

// Usage:
// Logger.info('STATE_MUTATION', 'Subnet map updated', { cidr: '10.0.0.0/24', action: 'split' });
// Logger.warn('VALIDATION', 'VLAN collision detected', { vlan: 100 });
// Logger.error('DATABASE', 'Snapshot persist failed', { error: e.message, stack: e.stack });
```

**Categories:**
- STATE_MUTATION: State changes (subnetMap, subnetNotes)
- RENDERING: Table renders, DOM updates
- VALIDATION: VLAN/gateway/VRF validation
- DATABASE: SQLite operations, migrations
- FILE_SYSTEM: File API operations, downloads
- HISTORY: Undo/redo operations

## Diagnostic Dashboard

**File:** `dist/diagnostic.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Diagnostics - Visual Subnet Calculator</title>
  <style>
    body { font-family: monospace; padding: 20px; background: #f5f5f5; }
    .metric { margin: 10px 0; padding: 10px; border: 1px solid #ddd; background: white; }
    .error { background: #ffebee; }
    .warn { background: #fff3e0; }
    button { margin: 10px 5px; padding: 8px 16px; }
  </style>
</head>
<body>
  <h1>Visual Subnet Calculator - Diagnostics</h1>

  <h2>System Health</h2>
  <div id="health"></div>

  <h2>Database Status</h2>
  <div id="db-status"></div>

  <h2>Recent Logs (Last 100)</h2>
  <div id="logs"></div>

  <button onclick="exportDiagnostics()">Export Diagnostics JSON</button>
  <button onclick="clearLogs()">Clear Logs</button>
  <button onclick="location.reload()">Refresh</button>

  <script src="js/logger.js"></script>
  <script src="js/planner-db.js"></script>
  <script>
    async function loadDiagnostics() {
      const parent = window.opener || window.parent;

      const health = {
        subnetMapSize: Object.keys(parent.subnetMap || {}).length,
        historyStackSize: parent.historyStack?.length || 0,
        historyPosition: parent.historyPosition ?? -1,
        dbInitialized: !!parent.plannerDbManager,
        mode: parent.operatingMode || 'Unknown'
      };

      document.getElementById('health').innerHTML = `<pre>${JSON.stringify(health, null, 2)}</pre>`;

      if (parent.plannerDbManager) {
        const dbDiag = await parent.plannerDbManager.getDiagnostics();
        document.getElementById('db-status').innerHTML = `<pre>${JSON.stringify(dbDiag, null, 2)}</pre>`;
      }

      const logs = parent.logBuffer || [];
      document.getElementById('logs').innerHTML = logs.slice(-100).map(log =>
        `<div class="${log.level.toLowerCase()}">${log.timestamp} [${log.category}] ${log.message} ${JSON.stringify(log.data || {})}</div>`
      ).join('');
    }

    function exportDiagnostics() {
      const parent = window.opener || window.parent;
      const diagnostics = {
        timestamp: new Date().toISOString(),
        health: { /* captured above */ },
        logs: parent.logBuffer || []
      };

      const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `diagnostics-${Date.now()}.json`;
      a.click();
    }

    function clearLogs() {
      (window.opener || window.parent).logBuffer = [];
      loadDiagnostics();
    }

    loadDiagnostics();
    setInterval(loadDiagnostics, 5000);
  </script>
</body>
</html>
```

## Integration into Main App

**File:** `dist/index.html` (add script tag after other JS)

```html
<script src="js/logger.js"></script>
<script>
  // Enable global Logger access
  window.Logger = Logger;
</script>
```

**File:** `dist/js/main.js` (replace console.log calls)

```javascript
// Before:
console.log('Splitting subnet', cidr);

// After:
Logger.info('STATE_MUTATION', 'Splitting subnet', { cidr, newSize });
```

## Implementation Checklist

- [ ] Create `dist/js/logger.js`
- [ ] Create `dist/diagnostic.html`
- [ ] Add logger script tag to `dist/index.html`
- [ ] Replace console.log in mutate_subnet_map with Logger.info
- [ ] Add Logger.error to all try/catch blocks
- [ ] Add Logger.warn to validation failures
- [ ] Add Logger.debug to DB operations
- [ ] Add "View Diagnostics" link to main page

## Validation

```bash
# Check logger integrated
grep -c "Logger\." dist/js/main.js
# Should be: >15

# Check console.log removed (except debug cases)
grep -c "console\.log" dist/js/main.js
# Should be: <5

# Manual: Open dist/diagnostic.html in browser
# Verify logs appear, diagnostics load
```

---

**Token Budget:** ~2.5k tokens
**Last Updated:** 2025-10-01
