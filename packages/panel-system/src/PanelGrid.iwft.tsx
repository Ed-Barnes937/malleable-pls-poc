import { test, expect } from '@playwright/experimental-ct-react'
import { PanelGrid, type PanelGridItem } from './PanelGrid'

const items: PanelGridItem[] = [
  { id: 'p1', x: 0, y: 0, w: 1, h: 2 },
  { id: 'p2', x: 1, y: 0, w: 1, h: 2 },
  { id: 'p3', x: 2, y: 0, w: 1, h: 2 },
]

test.describe('PanelGrid', () => {
  test('renders one grid item per panel', async ({ mount, page }) => {
    await mount(
      <div style={{ width: 900, height: 600 }}>
        <PanelGrid
          items={items}
          renderItem={(id) => <div>Panel {id}</div>}
        />
      </div>
    )
    const gridItems = page.locator('.react-grid-item')
    await expect(gridItems).toHaveCount(3, { timeout: 10000 })
  })

  test('shows drop zone when empty', async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 900, height: 600 }}>
        <PanelGrid
          items={[]}
          renderItem={() => null}
          onItemDrop={() => {}}
        />
      </div>
    )
    await expect(component.getByText('Drop lens here')).toBeVisible()
  })

  test('hides drop zone when items exist', async ({ mount, page }) => {
    await mount(
      <div style={{ width: 900, height: 600 }}>
        <PanelGrid
          items={items}
          renderItem={(id) => <div>Panel {id}</div>}
        />
      </div>
    )
    await expect(page.getByText('Drop lens here')).toHaveCount(0)
  })

  test('applies transitioning opacity', async ({ mount }) => {
    const component = await mount(
      <div style={{ width: 900, height: 600 }}>
        <PanelGrid
          items={items}
          renderItem={(id) => <div>Panel {id}</div>}
          transitioning={true}
        />
      </div>
    )
    const grid = component.locator('[class*="opacity-0"]')
    await expect(grid).toBeVisible()
  })

  test('handles items with NaN coordinates gracefully', async ({ mount, page }) => {
    const badItems: PanelGridItem[] = [
      { id: 'bad', x: NaN, y: NaN, w: NaN, h: NaN },
    ]
    await mount(
      <div style={{ width: 900, height: 600 }}>
        <PanelGrid
          items={badItems}
          renderItem={(id) => <div>Panel {id}</div>}
        />
      </div>
    )
    const gridItems = page.locator('.react-grid-item')
    await expect(gridItems).toHaveCount(1, { timeout: 10000 })
  })
})
