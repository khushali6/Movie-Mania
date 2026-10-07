import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('landing: no console errors, no horizontal scroll at phone width', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('does your errands');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('landing: the hero demo runs the laptop job to a result', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Cheapest laptop', exact: true }).click();
  const result = page.getByRole('region', { name: 'Result' });
  await expect(result).toContainText('Redmi Book 15', { timeout: 80_000 });
});

test('landing: the payment job stops for approval and needs a second press', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Pay a bill', exact: true }).click();
  const approve = page.getByRole('button', { name: 'Approve this action' });
  await expect(approve).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('region', { name: 'Result' })).toHaveCount(0);
  await expect(approve).toBeEnabled();
  await approve.click();
  await page.getByRole('button', { name: 'Confirm: approve this action' }).click();
  await expect(page.getByRole('region', { name: 'Result' })).toBeVisible({ timeout: 60_000 });
});

test('landing: Pantry search withholds private passages from remote askers', async ({ page }) => {
  await page.goto('/#pantry');
  await expect(page.getByText(/Found in/)).toBeVisible();
  await page.getByText('Model on this device').click();
  await expect(page.locator('.lp-passage', { hasText: 'Lease' }).first()).toBeVisible();
  await page.getByText('Remote, public only').click();
  await expect(page.locator('.lp-passage')).toHaveCount(0);
  await expect(page.getByText(/kept back because of who is asking/)).toBeVisible();
});

test('landing: failover demo finishes the job after a rate limit', async ({ page }) => {
  await page.goto('/#gateway');
  await page.getByRole('button', { name: 'Hit a rate limit' }).click();
  await expect(page.getByText(/Finished the whole job/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Switching from Free pool · auto/)).toBeVisible();
});

test('landing: accessibility (axe, WCAG AA)', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target.join(' ')})`)).toEqual([]);
});
