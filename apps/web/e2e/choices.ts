import { expect, type Locator, type Page } from '@playwright/test';

/** Exercise native radios for short choices and selects for larger lists. */
export async function chooseOption(
  scope: Page | Locator,
  label: string,
  value: string,
) {
  const cards = scope.getByRole('radiogroup', { name: label, exact: true });
  const select = scope
    .locator('select')
    .and(scope.getByLabel(label, { exact: true }));
  await expect(cards.or(select)).toBeVisible();
  if (await cards.count()) {
    const radio = cards
      .locator('input[type="radio"]')
      .and(cards.locator(`input[value=${JSON.stringify(value)}]`));
    if (!(await radio.isChecked())) await radio.click();
    await expect(radio).toBeChecked();
  } else await select.selectOption(value);
}
