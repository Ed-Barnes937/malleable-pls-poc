import { test, expect } from '../../../playwright/fixtures'
import { ScopePillHarness } from '../../../playwright/scope-pill-harness'

test('is a native select named by its label, reading its choice', async ({ mount, page }) => {
  await mount(<ScopePillHarness />)
  const select = page.getByRole('combobox', { name: 'Fruit' })
  await expect(select).toHaveValue('a')
  await expect(page.getByTestId('pill').getByTestId('scope-pill-text')).toHaveText('Apples')

  await select.selectOption({ label: 'Bananas' })
  await expect(page.getByTestId('value')).toHaveText('b')
  await expect(page.getByTestId('pill').getByTestId('scope-pill-text')).toHaveText('Bananas')
})

test('the keyboard reaches it and changes it (type-ahead)', async ({ mount, page }) => {
  await mount(<ScopePillHarness />)
  await page.getByRole('button', { name: 'Before' }).focus()
  await page.keyboard.press('Tab')
  const select = page.getByRole('combobox', { name: 'Fruit' })
  await expect(select).toBeFocused()
  // Type-ahead works the same on every platform (ArrowDown opens the menu on a Mac).
  await page.keyboard.press('b')
  await expect(page.getByTestId('value')).toHaveText('b')
  await expect(page.getByTestId('pill').getByTestId('scope-pill-text')).toHaveText('Bananas')
})

test('shows a focus ring only for keyboard focus', async ({ mount, page }) => {
  await mount(<ScopePillHarness />)
  const pill = page.getByTestId('pill')
  const ring = () => pill.evaluate((el) => getComputedStyle(el).boxShadow)
  expect(await ring()).toBe('none')
  await page.getByRole('button', { name: 'Before' }).focus()
  await page.keyboard.press('Tab')
  await expect.poll(ring).not.toBe('none')
})

test('the select fills the pill, so a tap anywhere on it opens the picker', async ({ mount, page }) => {
  await mount(<ScopePillHarness />)
  const pill = (await page.getByTestId('pill').boundingBox())!
  const select = (await page.getByRole('combobox', { name: 'Fruit' }).boundingBox())!
  expect(select).toEqual(pill)
  expect(pill.height).toBeGreaterThanOrEqual(36)
})

test('a long choice is cut with an ellipsis and read in full in its tooltip', async ({ mount, page }) => {
  await mount(<ScopePillHarness width={200} initial="c" />)
  const pill = page.getByTestId('pill')
  const text = pill.getByTestId('scope-pill-text')
  await expect(pill).toHaveAttribute('title', 'A very long option label that cannot fit in a narrow pill')
  expect(await text.evaluate((el) => getComputedStyle(el).textOverflow)).toBe('ellipsis')
  expect(await text.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  expect((await pill.boundingBox())!.width).toBeLessThanOrEqual(200)
})
