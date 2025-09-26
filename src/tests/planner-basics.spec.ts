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

    await page.getByRole('button', { name: 'Insert Sample Building' }).click();
    await expect(page.getByTestId('db-building-name')).toHaveText('Sample HQ');

    const { diagnostics, capabilities } = await page.evaluate(() => {
      const manager = (window as any).plannerDbManager;
      return {
        diagnostics: manager.getDiagnostics(),
        capabilities: {
          supportsFileSystemAccess: manager.supportsFileSystemAccess(),
        },
      };
    });

    expect(diagnostics.userVersion).toBe(2);
    expect(diagnostics.foreignKeys).toBe(1);
    expect(typeof capabilities.supportsFileSystemAccess).toBe('boolean');
    const saveButton = page.getByRole('button', { name: /Save Planner DB/i });
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeDisabled();
    expect(diagnostics.tables).toContain('tbl_building');
    expect(diagnostics.tables).toContain('tbl_interface');
    expect(diagnostics.tables).toContain('planner_state');
    expect(diagnostics.tables).toContain('planner_subnet');

    const exported = await page.evaluate(() => {
      const manager = (window as any).plannerDbManager;
      manager.run('PRAGMA user_version = 0;');
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

    expect(reopened.userVersion).toBe(2);
    expect(reopened.foreignKeys).toBe(1);
    await expect(page.getByTestId('db-building-name')).toHaveText('Sample HQ');
  });
});
