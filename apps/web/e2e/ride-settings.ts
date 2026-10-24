import { type Page } from '@playwright/test';

export async function openRideSetting(
  page: Page,
  name: 'video' | 'motion' | 'speed' | 'calibration',
) {
  const panel = page.locator(`details[data-ride-setting="${name}"]`);
  if (!(await panel.evaluate((element: HTMLDetailsElement) => element.open)))
    await panel.locator(':scope > summary').click();
}
