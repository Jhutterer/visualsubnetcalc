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

  test('validates VLAN collision across subnets', async ({ page }) => {
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

    // Create snapshot with two subnets directly via database
    await page.evaluate(async () => {
      const snapshot = {
        baseNetwork: '10.0.0.0/16',
        operatingMode: 'Standard',
        tree: [
          { cidr: '10.0.0.0/24', note: 'Subnet A', color: '' },
          { cidr: '10.0.1.0/24', note: 'Subnet B', color: '' },
        ],
      };
      await (window as any).plannerDbManager.savePlannerSnapshot(snapshot);
      // Bootstrap calculator from DB to render subnets
      if (typeof (window as any).bootstrapPlannerFromDb === 'function') {
        await (window as any).bootstrapPlannerFromDb();
      }
    });

    // Wait for subnets to render
    await page.waitForSelector('input.subnet-vlan-input[data-subnet="10.0.0.0/24"]', { timeout: 3000 });
    await page.waitForTimeout(200);

    // Assign VLAN 100 to first subnet
    const vlanInput1 = page.locator('input.subnet-vlan-input[data-subnet="10.0.0.0/24"]');
    await vlanInput1.fill('100');
    await vlanInput1.dispatchEvent('change');
    await page.waitForTimeout(300);

    // Verify VLAN is stored
    const vlan1Stored = await page.evaluate(() => {
      const map = (window as any).subnetMap || {};
      return map['10.0.0.0/24']?._vlan;
    });
    expect(vlan1Stored).toBe(100);

    // Try to assign same VLAN 100 to second subnet
    const vlanInput2 = page.locator('input.subnet-vlan-input[data-subnet="10.0.1.0/24"]');
    await vlanInput2.fill('100');
    await vlanInput2.dispatchEvent('change');
    await page.waitForTimeout(300);

    // Wait for warning modal to appear
    await page.waitForSelector('#notifyModal.modal.fade.show', { timeout: 3000 });

    // Check modal contains collision message
    const modalBody = await page.locator('#notifyModal .modal-body').textContent();
    expect(modalBody).toContain('VLAN 100 is already in use');

    // Verify second subnet did NOT get VLAN assigned
    const vlan2NotStored = await page.evaluate(() => {
      const map = (window as any).subnetMap || {};
      return map['10.0.1.0/24']?._vlan;
    });
    expect(vlan2NotStored).toBeUndefined();

    // Verify input was reverted
    await expect(vlanInput2).toHaveValue('');
  });

  test('validates gateway IP falls within usable subnet range', async ({ page }) => {
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

    // Set up base network in Standard mode (2 reserved IPs)
    await page.getByLabel('Network Address').fill('10.0.0.0');
    await page.getByLabel('Network Size').fill('24');
    await page.getByRole('button', { name: 'Go' }).click();
    await page.waitForTimeout(200);

    // Try to set gateway outside the subnet range
    const gatewayInput = page.locator('input.subnet-gateway-input[data-subnet="10.0.0.0/24"]');
    await gatewayInput.fill('10.0.1.1'); // Outside 10.0.0.0/24
    await gatewayInput.blur();
    await page.waitForTimeout(200);

    // Wait for warning modal
    await page.waitForSelector('#notifyModal.modal.fade.show', { timeout: 3000 });

    // Check modal contains range validation message
    const modalBody1 = await page.locator('#notifyModal .modal-body').textContent();
    expect(modalBody1).toContain('Gateway must fall within the usable range');

    // Verify gateway was NOT stored
    const gatewayNotStored = await page.evaluate(() => {
      const map = (window as any).subnetMap || {};
      return map['10.0.0.0/24']?._gateway;
    });
    expect(gatewayNotStored).toBeUndefined();

    // Close modal
    await page.click('#notifyModal button.btn-close');
    await page.waitForTimeout(200);

    // Try to set gateway in reserved range (network address)
    await gatewayInput.fill('10.0.0.0');
    await gatewayInput.blur();
    await page.waitForTimeout(200);

    // Should show warning again
    await page.waitForSelector('#notifyModal.modal.fade.show', { timeout: 3000 });
    const modalBody2 = await page.locator('#notifyModal .modal-body').textContent();
    expect(modalBody2).toContain('Gateway must fall within the usable range');

    // Close modal
    await page.click('#notifyModal button.btn-close');
    await page.waitForTimeout(200);

    // Set valid gateway in usable range (10.0.0.1 to 10.0.0.254 in Standard mode)
    await gatewayInput.fill('10.0.0.1');
    await gatewayInput.blur();
    await page.waitForTimeout(200);

    // Verify gateway IS stored
    const gatewayStored = await page.evaluate(() => {
      const map = (window as any).subnetMap || {};
      return map['10.0.0.0/24']?._gateway;
    });
    expect(gatewayStored).toBe('10.0.0.1');
  });

  test('persists VLAN, gateway, VRF, and purpose fields through SQLite', async ({ page }) => {
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

    // Set up base network
    await page.getByLabel('Network Address').fill('10.0.0.0');
    await page.getByLabel('Network Size').fill('24');
    await page.getByRole('button', { name: 'Go' }).click();
    await page.waitForTimeout(200);

    // Fill in all planner metadata fields
    const vlanInput = page.locator('input.subnet-vlan-input[data-subnet="10.0.0.0/24"]');
    await vlanInput.fill('200');
    await vlanInput.blur();
    await page.waitForTimeout(100);

    const gatewayInput = page.locator('input.subnet-gateway-input[data-subnet="10.0.0.0/24"]');
    await gatewayInput.fill('10.0.0.1');
    await gatewayInput.blur();
    await page.waitForTimeout(100);

    const vrfSelect = page.locator('select.subnet-vrf-select[data-subnet="10.0.0.0/24"]');
    await vrfSelect.selectOption('1'); // GLOBAL VRF
    await page.waitForTimeout(100);

    const purposeSelect = page.locator('select.subnet-purpose-select[data-subnet="10.0.0.0/24"]');
    await purposeSelect.selectOption('LAN');
    await page.waitForTimeout(100);

    // Verify all fields are in subnetMap
    const fieldsInMemory = await page.evaluate(() => {
      const map = (window as any).subnetMap || {};
      const entry = map['10.0.0.0/24'] || {};
      return {
        vlan: entry._vlan,
        gateway: entry._gateway,
        vrf: entry._vrf,
        purpose: entry._purpose,
      };
    });
    expect(fieldsInMemory.vlan).toBe(200);
    expect(fieldsInMemory.gateway).toBe('10.0.0.1');
    expect(fieldsInMemory.vrf).toBe(1);
    expect(fieldsInMemory.purpose).toBe('LAN');

    // Save snapshot
    await page.evaluate(async () => {
      const manager = (window as any).plannerDbManager;
      await manager.persistCurrentDatabase();
    });

    // Export database
    const exported = await page.evaluate(async () => {
      const manager = (window as any).plannerDbManager;
      return manager.exportDatabaseAsArray();
    });

    // Reload page
    await page.reload();
    await page.waitForFunction(() => Boolean((window as any).plannerDbManager));

    // Import database
    await page.evaluate(async (dataArray) => {
      const manager = (window as any).plannerDbManager;
      const bytes = new Uint8Array(dataArray);
      await manager.openDatabaseFromUint8Array(bytes, 'Test reload');
    }, exported);

    // Bootstrap calculator from database
    const hydrated = await page.evaluate(async () => {
      if (typeof (window as any).bootstrapPlannerFromDb === 'function') {
        try {
          return await (window as any).bootstrapPlannerFromDb();
        } catch (err) {
          console.warn('Bootstrap failed', err);
          return false;
        }
      }
      return false;
    });

    expect(hydrated).toBeTruthy();

    // Wait for UI to render
    await page.waitForTimeout(300);

    // Verify all fields are restored in UI
    await expect(page.locator('input.subnet-vlan-input[data-subnet="10.0.0.0/24"]')).toHaveValue('200');
    await expect(page.locator('input.subnet-gateway-input[data-subnet="10.0.0.0/24"]')).toHaveValue('10.0.0.1');
    await expect(page.locator('select.subnet-vrf-select[data-subnet="10.0.0.0/24"]')).toHaveValue('1');
    await expect(page.locator('select.subnet-purpose-select[data-subnet="10.0.0.0/24"]')).toHaveValue('LAN');

    // Verify fields are restored in subnetMap
    const fieldsRestored = await page.evaluate(() => {
      const map = (window as any).subnetMap || {};
      const entry = map['10.0.0.0/24'] || {};
      return {
        vlan: entry._vlan,
        gateway: entry._gateway,
        vrf: entry._vrf,
        purpose: entry._purpose,
      };
    });
    expect(fieldsRestored.vlan).toBe(200);
    expect(fieldsRestored.gateway).toBe('10.0.0.1');
    expect(fieldsRestored.vrf).toBe(1);
    expect(fieldsRestored.purpose).toBe('LAN');
  });

  test('validates INTERCONNECT purpose requires /30 or /31 subnet size', async ({ page }) => {
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

    // Set up /24 subnet (invalid for INTERCONNECT)
    await page.getByLabel('Network Address').fill('10.0.0.0');
    await page.getByLabel('Network Size').fill('24');
    await page.getByRole('button', { name: 'Go' }).click();
    await page.waitForTimeout(200);

    // Try to set purpose to INTERCONNECT on /24
    const purposeSelect24 = page.locator('select.subnet-purpose-select[data-subnet="10.0.0.0/24"]');
    await purposeSelect24.selectOption('INTERCONNECT');
    await page.waitForTimeout(200);

    // Wait for warning modal
    await page.waitForSelector('#notifyModal.modal.fade.show', { timeout: 3000 });

    // Check modal contains size validation message
    const modalBody = await page.locator('#notifyModal .modal-body').textContent();
    expect(modalBody).toContain('Interconnect subnets must be /30 or /31');

    // Verify purpose was reverted to LAN (dropdown revert triggers change event)
    const purposeReverted = await page.evaluate(() => {
      const map = (window as any).subnetMap || {};
      return map['10.0.0.0/24']?._purpose;
    });
    expect(purposeReverted).toBe('LAN');

    // Verify dropdown reverted to LAN (default)
    await expect(purposeSelect24).toHaveValue('LAN');

    // Close modal
    await page.click('#notifyModal button.btn-close');
    await page.waitForTimeout(200);

    // Create a /30 subnet (valid for INTERCONNECT)
    await page.getByLabel('Network Address').fill('10.0.0.0');
    await page.getByLabel('Network Size').fill('30');
    await page.getByRole('button', { name: 'Go' }).click();
    await page.waitForTimeout(200);

    // Set purpose to INTERCONNECT on /30 (should succeed)
    const purposeSelect30 = page.locator('select.subnet-purpose-select[data-subnet="10.0.0.0/30"]');
    await purposeSelect30.selectOption('INTERCONNECT');
    await page.waitForTimeout(200);

    // Verify purpose IS stored
    const purposeStored30 = await page.evaluate(() => {
      const map = (window as any).subnetMap || {};
      return map['10.0.0.0/30']?._purpose;
    });
    expect(purposeStored30).toBe('INTERCONNECT');

    // Create a /31 subnet (also valid for INTERCONNECT)
    await page.getByLabel('Network Address').fill('10.0.0.8');
    await page.getByLabel('Network Size').fill('31');
    await page.getByRole('button', { name: 'Go' }).click();
    await page.waitForTimeout(200);

    // Set purpose to INTERCONNECT on /31 (should succeed)
    const purposeSelect31 = page.locator('select.subnet-purpose-select[data-subnet="10.0.0.8/31"]');
    await purposeSelect31.selectOption('INTERCONNECT');
    await page.waitForTimeout(200);

    // Verify purpose IS stored
    const purposeStored31 = await page.evaluate(() => {
      const map = (window as any).subnetMap || {};
      return map['10.0.0.8/31']?._purpose;
    });
    expect(purposeStored31).toBe('INTERCONNECT');
  });
});
