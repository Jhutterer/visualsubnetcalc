import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test.describe('Planner XML Export', () => {
  test('XML export button is disabled without database', async ({ page }) => {
    await page.goto('/');

    // Wait for planner manager to be available
    await page.waitForFunction(() => Boolean((window as any).plannerDbManager));

    // Verify export XML button exists and is disabled
    const exportXmlBtn = page.locator('#db-export-xml-btn');
    await expect(exportXmlBtn).toBeVisible();
    await expect(exportXmlBtn).toBeDisabled();
  });

  test('XML export button is enabled after creating database', async ({ page }) => {
    await page.goto('/');

    // Wait for planner manager to be available
    await page.waitForFunction(() => Boolean((window as any).plannerDbManager));

    // Create database
    await page.getByRole('button', { name: /Create Planner DB/i }).click();
    await page.waitForFunction(() => {
      const manager = (window as any).plannerDbManager;
      return manager?.hasDatabase?.();
    });

    // Verify export XML button is now enabled
    const exportXmlBtn = page.locator('#db-export-xml-btn');
    await expect(exportXmlBtn).toBeEnabled();
  });

  test('exports planner database to XML with correct structure', async ({ page }) => {
    await page.goto('/');

    // Wait for planner manager to be available
    await page.waitForFunction(() => Boolean((window as any).plannerDbManager));

    // Create database
    await page.evaluate(async () => {
      const manager = (window as any).plannerDbManager;
      await manager.createInMemory();
    });

    await page.waitForFunction(() => {
      const manager = (window as any).plannerDbManager;
      return manager?.hasDatabase?.();
    });

    // Create test snapshot with subnets
    const snapshot = {
      baseNetwork: '10.0.0.0/16',
      operatingMode: 'AWS',
      tree: [
        {
          cidr: '10.0.0.0/20',
          note: 'HQ Network',
          color: '#ff0000',
          name: 'Headquarters',
          vlanId: 100,
          gatewayIp: '10.0.0.1',
          vrfId: 1, // GLOBAL
          purpose: 'LAN',
          children: [
            {
              cidr: '10.0.0.0/22',
              note: 'Production',
              color: '#00ff00',
              name: 'Prod',
              vlanId: 101,
              gatewayIp: '10.0.0.1',
              vrfId: 1,
              purpose: 'LAN',
            },
            {
              cidr: '10.0.4.0/22',
              note: 'Development',
              color: '#0000ff',
              name: 'Dev',
              vlanId: 102,
              gatewayIp: '10.0.4.1',
              vrfId: 2, // MGMT
              purpose: 'LAN',
            },
          ],
        },
        {
          cidr: '10.0.16.0/20',
          note: 'Remote Site',
          color: '#ffff00',
          name: 'Remote',
          children: [],
        },
      ],
    };

    await page.evaluate(async (data) => {
      await (window as any).plannerDbManager.savePlannerSnapshot(data);
    }, snapshot);

    // Set up download listener BEFORE clicking button
    const downloadPromise = page.waitForEvent('download');

    // Click XML export button
    const exportXmlBtn = page.locator('#db-export-xml-btn');
    await exportXmlBtn.click();

    // Wait for download
    const download = await downloadPromise;

    // Validate filename pattern: planner-export-YYYY-MM-DD-HHMMSS.xml
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/^planner-export-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.xml$/);

    // Read XML content
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const xmlContent = fs.readFileSync(downloadPath!, 'utf-8');

    // Validate XML declaration
    expect(xmlContent).toContain('<?xml version="1.0" encoding="UTF-8"?>');

    // Validate root element
    expect(xmlContent).toContain('<planner_export version="1.0">');
    expect(xmlContent).toContain('</planner_export>');

    // Validate metadata section
    expect(xmlContent).toContain('<metadata>');
    expect(xmlContent).toContain('</metadata>');
    expect(xmlContent).toContain('<export_timestamp>');
    expect(xmlContent).toContain('<schema_version>4</schema_version>');

    // Validate planner_state section
    expect(xmlContent).toContain('<planner_state>');
    expect(xmlContent).toContain('</planner_state>');
    expect(xmlContent).toContain('<base_network>10.0.0.0/16</base_network>');
    expect(xmlContent).toContain('<operating_mode>AWS</operating_mode>');

    // Validate subnets section
    expect(xmlContent).toContain('<subnets>');
    expect(xmlContent).toContain('</subnets>');
    expect(xmlContent).toMatch(/<subnet id="1"/);
    expect(xmlContent).toMatch(/<subnet id="2"/);
    expect(xmlContent).toMatch(/<subnet id="3"/);
    expect(xmlContent).toMatch(/<subnet id="4"/);

    // Validate subnet content (HQ Network - id should be 1 based on insert order)
    expect(xmlContent).toContain('<cidr>10.0.0.0/20</cidr>');
    expect(xmlContent).toContain('<note>HQ Network</note>');
    expect(xmlContent).toContain('<color>#ff0000</color>');
    expect(xmlContent).toContain('<name>Headquarters</name>');
    expect(xmlContent).toContain('<vlan_id>100</vlan_id>');
    expect(xmlContent).toContain('<gateway_ip>10.0.0.1</gateway_ip>');
    expect(xmlContent).toContain('<purpose>LAN</purpose>');
    expect(xmlContent).toContain('<vrf_id>1</vrf_id>');
    expect(xmlContent).toContain('<vrf_name>GLOBAL</vrf_name>');

    // Validate VRFs section
    expect(xmlContent).toContain('<vrfs>');
    expect(xmlContent).toContain('</vrfs>');
    expect(xmlContent).toContain('<vrf id="1" name="GLOBAL"/>');
    expect(xmlContent).toContain('<vrf id="2" name="MGMT"/>');

    // Verify MGMT VRF is correctly resolved (Dev subnet uses VRF 2)
    expect(xmlContent).toContain('<cidr>10.0.4.0/22</cidr>');
    const mgmtVrfIndex = xmlContent.indexOf('<cidr>10.0.4.0/22</cidr>');
    const afterDevSubnet = xmlContent.substring(mgmtVrfIndex);
    const nextSubnetIndex = afterDevSubnet.indexOf('<subnet id=');
    const devSubnetXml = afterDevSubnet.substring(0, nextSubnetIndex > 0 ? nextSubnetIndex : afterDevSubnet.length);
    expect(devSubnetXml).toContain('<vrf_id>2</vrf_id>');
    expect(devSubnetXml).toContain('<vrf_name>MGMT</vrf_name>');
  });

  test('XML export handles special characters with proper escaping', async ({ page }) => {
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

    // Create snapshot with special characters
    const snapshot = {
      baseNetwork: '10.0.0.0/24',
      operatingMode: 'Standard',
      tree: [
        {
          cidr: '10.0.0.0/24',
          note: 'Test & <Special> "Characters" \'Here\'',
          name: 'Name with & ampersand',
          children: [],
        },
      ],
    };

    await page.evaluate(async (data) => {
      await (window as any).plannerDbManager.savePlannerSnapshot(data);
    }, snapshot);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#db-export-xml-btn').click();
    const download = await downloadPromise;

    const downloadPath = await download.path();
    const xmlContent = fs.readFileSync(downloadPath!, 'utf-8');

    // Verify XML escaping
    expect(xmlContent).toContain('Test &amp; &lt;Special&gt; &quot;Characters&quot; &apos;Here&apos;');
    expect(xmlContent).toContain('Name with &amp; ampersand');

    // Ensure raw characters are NOT present (unescaped)
    const noteMatch = xmlContent.match(/<note>(.*?)<\/note>/);
    expect(noteMatch).toBeTruthy();
    if (noteMatch) {
      expect(noteMatch[1]).not.toContain('Test & <Special>');
      expect(noteMatch[1]).toContain('&amp;');
      expect(noteMatch[1]).toContain('&lt;');
      expect(noteMatch[1]).toContain('&gt;');
      expect(noteMatch[1]).toContain('&quot;');
      expect(noteMatch[1]).toContain('&apos;');
    }
  });

  test('XML export handles null and empty fields properly', async ({ page }) => {
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

    // Create snapshot with minimal metadata (nulls/empty values)
    const snapshot = {
      baseNetwork: '10.0.0.0/24',
      operatingMode: 'Standard',
      tree: [
        {
          cidr: '10.0.0.0/24',
          note: '',
          color: '',
          name: '',
          children: [],
        },
      ],
    };

    await page.evaluate(async (data) => {
      await (window as any).plannerDbManager.savePlannerSnapshot(data);
    }, snapshot);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#db-export-xml-btn').click();
    const download = await downloadPromise;

    const downloadPath = await download.path();
    const xmlContent = fs.readFileSync(downloadPath!, 'utf-8');

    // Verify empty elements for null/empty fields
    expect(xmlContent).toContain('<note/>');
    expect(xmlContent).toContain('<color/>');
    expect(xmlContent).toContain('<name/>');
    expect(xmlContent).toContain('<vlan_id/>');
    expect(xmlContent).toContain('<gateway_ip/>');
    expect(xmlContent).toContain('<vrf_id/>');
    expect(xmlContent).toContain('<vrf_name/>');
  });

  test('XML export produces deterministic output with consistent ordering', async ({ page }) => {
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

    // Create snapshot with multiple subnets
    const snapshot = {
      baseNetwork: '10.0.0.0/16',
      operatingMode: 'Standard',
      tree: [
        { cidr: '10.0.0.0/24', note: 'Subnet A', children: [] },
        { cidr: '10.0.1.0/24', note: 'Subnet B', children: [] },
        { cidr: '10.0.2.0/24', note: 'Subnet C', children: [] },
      ],
    };

    await page.evaluate(async (data) => {
      await (window as any).plannerDbManager.savePlannerSnapshot(data);
    }, snapshot);

    // First export
    const downloadPromise1 = page.waitForEvent('download');
    await page.locator('#db-export-xml-btn').click();
    const download1 = await downloadPromise1;
    const downloadPath1 = await download1.path();
    const xmlContent1 = fs.readFileSync(downloadPath1!, 'utf-8');

    // Wait a moment
    await page.waitForTimeout(100);

    // Second export
    const downloadPromise2 = page.waitForEvent('download');
    await page.locator('#db-export-xml-btn').click();
    const download2 = await downloadPromise2;
    const downloadPath2 = await download2.path();
    const xmlContent2 = fs.readFileSync(downloadPath2!, 'utf-8');

    // Remove timestamp lines (they will differ between exports)
    const normalizeXml = (xml: string) => {
      return xml.replace(/<export_timestamp>.*?<\/export_timestamp>/g, '<export_timestamp>NORMALIZED</export_timestamp>');
    };

    const normalized1 = normalizeXml(xmlContent1);
    const normalized2 = normalizeXml(xmlContent2);

    // Verify deterministic ordering (everything except timestamp should be identical)
    expect(normalized1).toBe(normalized2);

    // Verify subnets appear in ID order (1, 2, 3)
    const subnetMatches = [...xmlContent1.matchAll(/<subnet id="(\d+)"/g)];
    const subnetIds = subnetMatches.map(m => parseInt(m[1]));

    // IDs should be sequential starting from 1
    expect(subnetIds.length).toBe(3);
    expect(subnetIds[0]).toBe(1);
    expect(subnetIds[1]).toBe(2);
    expect(subnetIds[2]).toBe(3);

    // Verify notes appear in correct order
    const notePattern = /<note>(Subnet [ABC])<\/note>/g;
    const noteMatches = [...xmlContent1.matchAll(notePattern)];
    const noteOrder = noteMatches.map(m => m[1]);

    expect(noteOrder).toEqual(['Subnet A', 'Subnet B', 'Subnet C']);
  });

  test('XML export includes parent_id relationships correctly', async ({ page }) => {
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

    // Create hierarchical snapshot
    const snapshot = {
      baseNetwork: '10.0.0.0/16',
      operatingMode: 'Standard',
      tree: [
        {
          cidr: '10.0.0.0/20',
          note: 'Parent',
          children: [
            { cidr: '10.0.0.0/24', note: 'Child 1' },
            { cidr: '10.0.1.0/24', note: 'Child 2' },
          ],
        },
      ],
    };

    await page.evaluate(async (data) => {
      await (window as any).plannerDbManager.savePlannerSnapshot(data);
    }, snapshot);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#db-export-xml-btn').click();
    const download = await downloadPromise;

    const downloadPath = await download.path();
    const xmlContent = fs.readFileSync(downloadPath!, 'utf-8');

    // Extract subnet elements with their IDs and parent_ids
    const subnetPattern = /<subnet id="(\d+)" parent_id="([^"]*)">/g;
    const subnetMatches = [...xmlContent.matchAll(subnetPattern)];

    expect(subnetMatches.length).toBe(3);

    // First subnet (Parent) should have empty parent_id
    const parent = subnetMatches[0];
    expect(parent[1]).toBe('1'); // ID
    expect(parent[2]).toBe(''); // empty parent_id (root node)

    // Children should reference parent's ID (1)
    const child1 = subnetMatches[1];
    expect(child1[1]).toBe('2'); // ID
    expect(child1[2]).toBe('1'); // parent_id = 1

    const child2 = subnetMatches[2];
    expect(child2[1]).toBe('3'); // ID
    expect(child2[2]).toBe('1'); // parent_id = 1

    // Verify notes match expected hierarchy
    expect(xmlContent).toMatch(/<subnet id="1"[^>]*>[\s\S]*?<note>Parent<\/note>/);
    expect(xmlContent).toMatch(/<subnet id="2" parent_id="1">[\s\S]*?<note>Child 1<\/note>/);
    expect(xmlContent).toMatch(/<subnet id="3" parent_id="1">[\s\S]*?<note>Child 2<\/note>/);
  });

  test('XML export works with empty database (no subnets)', async ({ page }) => {
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

    // Don't save any snapshot - database has default empty state

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#db-export-xml-btn').click();
    const download = await downloadPromise;

    const downloadPath = await download.path();
    const xmlContent = fs.readFileSync(downloadPath!, 'utf-8');

    // Verify basic XML structure is present
    expect(xmlContent).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xmlContent).toContain('<planner_export version="1.0">');
    expect(xmlContent).toContain('<metadata>');
    expect(xmlContent).toContain('<planner_state>');
    expect(xmlContent).toContain('<subnets>');
    expect(xmlContent).toContain('</subnets>');
    expect(xmlContent).toContain('<vrfs>');
    expect(xmlContent).toContain('</vrfs>');
    expect(xmlContent).toContain('</planner_export>');

    // Verify VRFs are present (default GLOBAL and MGMT)
    expect(xmlContent).toContain('<vrf id="1" name="GLOBAL"/>');
    expect(xmlContent).toContain('<vrf id="2" name="MGMT"/>');

    // Verify no subnet elements
    expect(xmlContent).not.toMatch(/<subnet id="\d+"/);
  });
});
