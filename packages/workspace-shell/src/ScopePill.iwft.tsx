import type { Page } from '@playwright/test'
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

test('the keyboard reaches it and changes it: type-ahead, then Enter', async ({ mount, page }) => {
  await mount(<ScopePillHarness />)
  await page.getByRole('button', { name: 'Before' }).focus()
  await page.keyboard.press('Tab')
  const select = page.getByRole('combobox', { name: 'Fruit' })
  await expect(select).toBeFocused()
  // Type-ahead works the same on every platform (ArrowDown opens the menu on a Mac).
  await page.keyboard.press('b')
  await expect(page.getByTestId('pill').getByTestId('scope-pill-text')).toHaveText('Bananas')
  // A choice by key is confirmed by Enter (or leaving the pill), not at once.
  await expect(page.getByTestId('value')).toHaveText('a')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('value')).toHaveText('b')
  await expect(page.getByTestId('changes')).toHaveText('b')
})

/**
 * What Windows and Linux do on a closed select's ArrowDown: the key, then
 * the new value and its `change`, as the key's default action (the same task).
 */
async function arrowTo(page: Page, value: string) {
  await page.getByRole('combobox', { name: 'Fruit' }).evaluate((el: HTMLSelectElement, v) => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    el.value = v
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

test.describe('a change per arrow press (a closed select on Windows and Linux)', () => {
  test('arrowing through the list confirms nothing on the way; Enter confirms the last, once', async ({ mount, page }) => {
    await mount(<ScopePillHarness />)
    const select = page.getByRole('combobox', { name: 'Fruit' })
    const text = page.getByTestId('pill').getByTestId('scope-pill-text')
    await select.focus()

    await arrowTo(page, 'b')
    await expect(text).toHaveText('Bananas')
    await expect(select).toHaveValue('b')
    await arrowTo(page, 'c')
    await expect(text).toHaveText('A very long option label that cannot fit in a narrow pill')
    await expect(page.getByTestId('pill')).toHaveAttribute('data-draft', 'true')
    // A draft reads differently from a saved choice: italic, with a dashed outline.
    await expect(page.getByTestId('pill')).toHaveCSS('font-style', 'italic')
    await expect(page.getByTestId('pill')).toHaveCSS('outline-style', 'dashed')
    await expect(page.getByTestId('changes')).toHaveText('')

    await page.keyboard.press('Enter')
    await expect(page.getByTestId('changes')).toHaveText('c')
    await expect(page.getByTestId('pill')).not.toHaveAttribute('data-draft')
    await expect(page.getByTestId('pill')).toHaveCSS('font-style', 'normal')
    await expect(page.getByTestId('pill')).toHaveCSS('outline-style', 'none')
    // Enter again changes nothing more.
    await page.keyboard.press('Enter')
    await select.blur()
    await expect(page.getByTestId('changes')).toHaveText('c')
  })

  test('leaving the pill confirms the choice', async ({ mount, page }) => {
    await mount(<ScopePillHarness />)
    await page.getByRole('combobox', { name: 'Fruit' }).focus()
    await arrowTo(page, 'b')
    await arrowTo(page, 'c')
    await arrowTo(page, 'b')
    await expect(page.getByTestId('changes')).toHaveText('')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
    await expect(page.getByTestId('changes')).toHaveText('b')
  })

  test('Escape drops it, and arrowing back to the start confirms nothing', async ({ mount, page }) => {
    await mount(<ScopePillHarness />)
    const select = page.getByRole('combobox', { name: 'Fruit' })
    const text = page.getByTestId('pill').getByTestId('scope-pill-text')
    await select.focus()
    await arrowTo(page, 'c')
    await page.keyboard.press('Escape')
    await expect(text).toHaveText('Apples')
    await expect(select).toHaveValue('a')

    await arrowTo(page, 'b')
    await arrowTo(page, 'a')
    await select.blur()
    await expect(text).toHaveText('Apples')
    await expect(page.getByTestId('changes')).toHaveText('')
  })

  test('a pick from the open list (no key before its change) is confirmed at once', async ({ mount, page }) => {
    await mount(<ScopePillHarness />)
    const select = page.getByRole('combobox', { name: 'Fruit' })
    await select.selectOption({ label: 'Bananas' })
    await expect(page.getByTestId('changes')).toHaveText('b')
    // A key press long done (the Mac opens the menu on ArrowDown, then a click picks).
    await select.evaluate((el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    await page.waitForTimeout(50)
    await select.selectOption({ label: 'Apples' })
    await expect(page.getByTestId('changes')).toHaveText('b,a')
  })
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
