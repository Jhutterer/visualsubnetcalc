import { test, expect } from '@playwright/test';

test.describe('Planner database bootstrap', () => {
  test('initializes, seeds, and reopens planner database', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /Create Planner DB/i }).click();
    await page.waitForFunction(() => {
      const manager = (window as any).plannerDbManager;
      return manager?.hasDatabase?.();
    });
    await expect(page.getByTestId('db-status')).toContainText('Connected');

    // M1.5: insertSampleBuilding() is now a no-op (tbl_building removed)
    // This button click is kept to verify UI doesn't break, but we don't assert on results
    await page.getByRole('button', { name: 'Insert Sample Building' }).click();

    const { diagnostics, capabilities } = await page.evaluate(() => {
      const manager = (window as any).plannerDbManager;
      return {
        diagnostics: manager.getDiagnostics(),
        capabilities: {
          supportsFileSystemAccess: manager.supportsFileSystemAccess(),
        },
      };
    });

    expect(diagnostics.userVersion).toBe(4);
    expect(diagnostics.foreignKeys).toBe(1);
    expect(typeof capabilities.supportsFileSystemAccess).toBe('boolean');
    const saveButton = page.getByRole('button', { name: /Save Planner DB/i });
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeDisabled();
    // M1.5: Verify only v3 schema tables exist (tbl_* tables removed)
    expect(diagnostics.tables).toContain('planner_state');
    expect(diagnostics.tables).toContain('planner_subnet');
    expect(diagnostics.tables).toContain('planner_vrf');
    expect(diagnostics.tables).not.toContain('tbl_building');
    expect(diagnostics.tables).not.toContain('tbl_interface');

    const exported = await page.evaluate(() => {
      const manager = (window as any).plannerDbManager;
      // M1.5: Don't reset version - export/import should preserve schema version
      // Resetting to v0 artificially would cause duplicate column errors on re-migration
      return manager.exportDatabaseAsArray();
    });

    await page.evaluate(async (dataArray) => {
      const manager = (window as any).plannerDbManager;
      const bytes = new Uint8Array(dataArray);
      await manager.openDatabaseFromUint8Array(bytes, 'Re-opened export');
    }, exported);

    const reopened = await page.evaluate(() => {
      const manager = (window as any).plannerDbManager;
      return manager.getDiagnostics();
    });

    expect(reopened.userVersion).toBe(4);
    expect(reopened.foreignKeys).toBe(1);
    // M1.5: No building data to verify (tbl_building removed)
  });
});
