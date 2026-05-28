import { test, expect } from '@playwright/experimental-ct-react'
import { PanelChrome } from './PanelChrome'
import { PanelChromeWithIcon } from './test-helpers'

test.use({ viewport: { width: 400, height: 300 } })

test.describe('PanelChrome', () => {
  test('renders title text', async ({ mount }) => {
    const component = await mount(<PanelChrome title="My Panel" />)
    await expect(component.getByTestId('panel-title')).toHaveText('My Panel')
  })

  test('renders fallback FileText icon when no icon prop provided', async ({ mount }) => {
    const component = await mount(<PanelChrome title="No Icon" />)
    const icon = component.getByTestId('panel-icon')
    await expect(icon).toBeVisible()
  })

  test('renders custom icon when provided', async ({ mount }) => {
    const component = await mount(
      <PanelChromeWithIcon title="Custom" />,
    )
    // Custom StarIcon renders "★" instead of the FileText SVG fallback
    await expect(component.getByText('★')).toBeVisible()
  })

  test('close button click fires onClose callback', async ({ mount }) => {
    let closed = false
    const component = await mount(
      <PanelChrome title="Closeable" onClose={() => { closed = true }} />,
    )
    await component.getByTestId('panel-close').click()
    expect(closed).toBe(true)
  })

  test('fullscreen button click fires onToggleFullscreen callback', async ({ mount }) => {
    let toggled = false
    const component = await mount(
      <PanelChrome
        title="Fullscreenable"
        onToggleFullscreen={() => { toggled = true }}
      />,
    )
    await component.getByTestId('panel-fullscreen').click()
    expect(toggled).toBe(true)
  })

  test('fullscreen button shows Maximize2 when not fullscreen', async ({ mount }) => {
    const component = await mount(
      <PanelChrome
        title="Panel"
        isFullscreen={false}
        onToggleFullscreen={() => {}}
      />,
    )
    await expect(
      component.getByTestId('panel-fullscreen'),
    ).toHaveAttribute('aria-label', 'Fullscreen Panel')
  })

  test('fullscreen button shows Minimize2 when fullscreen', async ({ mount }) => {
    const component = await mount(
      <PanelChrome
        title="Panel"
        isFullscreen={true}
        onToggleFullscreen={() => {}}
      />,
    )
    await expect(
      component.getByTestId('panel-fullscreen'),
    ).toHaveAttribute('aria-label', 'Exit fullscreen Panel')
  })

  test('hides fullscreen button when onToggleFullscreen is not provided', async ({ mount }) => {
    const component = await mount(<PanelChrome title="No Fullscreen" />)
    await expect(component.getByTestId('panel-fullscreen')).toHaveCount(0)
  })
})
