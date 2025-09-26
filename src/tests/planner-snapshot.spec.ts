import { test, expect } from '@playwright/test';

test.describe('Planner snapshot persistence', () => {
  test('saves and loads planner subnet tree via SQLite', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(() => Boolean((window as any).plannerDbManager));

    await page.evaluate(async () => {
      const manager = (window as any).plannerDbManager;
      await manager.createInMemory();
    });

    await page.waitForFunction(() => {
      const manager = (window as any).plannerDbManager;
      return manager?.hasDatabase?.();
    });

    const snapshot = {
      baseNetwork: '10.0.0.0/16',
      operatingMode: 'AWS',
      tree: [
        {
          cidr: '10.0.0.0/20',
          note: 'HQ',
          color: '#ff0000',
          children: [
            { cidr: '10.0.0.0/22', note: 'Prod', color: '#00ff00' },
            { cidr: '10.0.4.0/22', note: 'Dev', color: '#0000ff' },
          ],
        },
        {
          cidr: '10.0.16.0/20',
          note: 'Remote',
          color: '#ffff00',
          children: [],
        },
      ],
    };

    await page.evaluate(async (data) => {
      await (window as any).plannerDbManager.savePlannerSnapshot(data);
    }, snapshot);

    const rowCount = await page.evaluate(() => {
      const manager = (window as any).plannerDbManager;
      return manager.selectAll('SELECT COUNT(*) AS total FROM planner_subnet;')[0]?.total;
    });
    expect(rowCount).toBe(4);

    const loaded = await page.evaluate(async () => {
      return (window as any).plannerDbManager.loadPlannerSnapshot();
    });

    expect(loaded.baseNetwork).toBe('10.0.0.0/16');
    expect(loaded.operatingMode).toBe('AWS');
    expect(Array.isArray(loaded.tree)).toBeTruthy();
    expect(loaded.tree).toHaveLength(2);
    expect(loaded.tree[0].cidr).toBe('10.0.0.0/20');
    expect(loaded.tree[0].children).toHaveLength(2);
    expect(loaded.tree[0].children[0].note).toBe('Prod');
    expect(loaded.tree[0].children[0].ordinal).toBe(0);
    expect(loaded.tree[0].children[1].ordinal).toBe(1);
    expect(typeof loaded.updatedAt === 'string' || loaded.updatedAt === null).toBeTruthy();

    await page.evaluate(async () => {
      await (window as any).plannerDbManager.savePlannerSnapshot({
        baseNetwork: '',
        operatingMode: 'Standard',
        tree: [],
      });
    });

    const cleared = await page.evaluate(async () => {
      return (window as any).plannerDbManager.loadPlannerSnapshot();
    });

    expect(cleared.tree).toHaveLength(0);
    expect(cleared.baseNetwork).toBe('');
    expect(cleared.operatingMode).toBe('Standard');
  });

  test('restores calculator view from SQLite snapshot on reopen', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(() => Boolean((window as any).plannerDbManager));

    await page.evaluate(async () => {
      const manager = (window as any).plannerDbManager;
      await manager.createInMemory();
    });

    await page.waitForFunction(() => {
      const manager = (window as any).plannerDbManager;
      return manager?.hasDatabase?.();
    });

    await page.getByLabel('Network Address').fill('10.0.0.0');
    await page.getByLabel('Network Size').fill('24');
    await page.getByRole('button', { name: 'Go' }).click();

    const noteText = 'Primary Data Centre';
    const noteField = page.getByRole('textbox', { name: '10.0.0.0/24 Note' });
    await noteField.fill(noteText);
    await noteField.press('Tab');

    const dataAttributes = await page.evaluate(() => {
      const el = document.querySelector('input[data-subnet="10.0.0.0/24"]');
      return {
        exists: Boolean(el),
        dataset: el ? el.getAttribute('data-subnet') : null,
        value: el instanceof HTMLInputElement ? el.value : null,
      };
    });
    expect(dataAttributes.exists).toBeTruthy();
    expect(dataAttributes.dataset).toBe('10.0.0.0/24');

    await page.waitForTimeout(200);

    const inMemoryNote = await page.evaluate(() => {
      const map = (window as any).subnetMap || {};
      return map['10.0.0.0/24']?._note ?? null;
    });
    expect(inMemoryNote).toBe(noteText);

    const snapshotBeforeReload = await page.evaluate(async () => {
      const manager = (window as any).plannerDbManager;
      await manager.persistCurrentDatabase();
      return manager.loadPlannerSnapshot();
    });

    expect(snapshotBeforeReload?.tree?.[0]?.note).toBe(noteText);

    const exported = await page.evaluate(async () => {
      const manager = (window as any).plannerDbManager;
      return manager.exportDatabaseAsArray();
    });

    await page.reload();
    await page.waitForFunction(() => Boolean((window as any).plannerDbManager));

    await page.evaluate(async (dataArray) => {
      const manager = (window as any).plannerDbManager;
      const bytes = new Uint8Array(dataArray);
      await manager.openDatabaseFromUint8Array(bytes, 'Reopened snapshot');
    }, exported);

    const hydrated = await page.evaluate(async () => {
      if (typeof (window as any).bootstrapPlannerFromDb === 'function') {
        try {
          return await (window as any).bootstrapPlannerFromDb();
        } catch (err) {
          console.warn('Manual planner bootstrap failed', err);
        }
      }
      return false;
    });

    expect(hydrated).toBeTruthy();

    await page.waitForFunction((expected) => {
      const input = document.querySelector('input[data-subnet="10.0.0.0/24"]');
      return input instanceof HTMLInputElement && input.value === expected;
    }, noteText);

    await expect(page.getByLabel('Network Address')).toHaveValue('10.0.0.0');
    await expect(page.getByRole('textbox', { name: '10.0.0.0/24 Note' })).toHaveValue(noteText);
  });
});
