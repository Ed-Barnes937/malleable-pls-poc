import { test, expect } from '@playwright/experimental-ct-react'
import { Spinner } from './Spinner'

test('renders with status role', async ({ mount, page }) => {
  await mount(<Spinner />)
  await expect(page.getByRole('status')).toBeVisible()
})

test('has Loading aria-label', async ({ mount, page }) => {
  await mount(<Spinner />)
  await expect(page.getByRole('status')).toHaveAttribute('aria-label', 'Loading')
})

test('sm size applies small dimensions', async ({ mount, page }) => {
  await mount(<Spinner size="sm" />)
  const spinner = page.getByRole('status')
  await expect(spinner).toHaveClass(/h-3/)
  await expect(spinner).toHaveClass(/w-3/)
})

test('md size is the default', async ({ mount, page }) => {
  await mount(<Spinner />)
  const spinner = page.getByRole('status')
  await expect(spinner).toHaveClass(/h-5/)
  await expect(spinner).toHaveClass(/w-5/)
})

test('lg size applies large dimensions', async ({ mount, page }) => {
  await mount(<Spinner size="lg" />)
  const spinner = page.getByRole('status')
  await expect(spinner).toHaveClass(/h-8/)
  await expect(spinner).toHaveClass(/w-8/)
})

test('has spin animation', async ({ mount, page }) => {
  await mount(<Spinner />)
  await expect(page.getByRole('status')).toHaveClass(/animate-spin/)
})
