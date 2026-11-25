import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { Sortable, SortableHandle, SortableItem } from './Sortable'

const NAMES: Record<string, string> = { maths: 'Maths', physics: 'Physics', chem: 'Chemistry', bio: 'Biology' }

function Harness({ onChange, enterActivates }: { onChange: (v: string[]) => void; enterActivates?: boolean }) {
  const [ids, setIds] = useState(['maths', 'physics', 'chem', 'bio'])
  return (
    <Sortable
      aria-label="Boards"
      orientation="horizontal"
      value={ids}
      onValueChange={(v) => {
        onChange(v)
        setIds(v)
      }}
      label={(key) => `${NAMES[key]} board`}
    >
      {({ order }) =>
        order.map((id) => (
          <SortableItem key={id} value={id} data-testid="item">
            <SortableHandle enterActivates={enterActivates}>{NAMES[id]}</SortableHandle>
          </SortableItem>
        ))
      }
    </Sortable>
  )
}

const names = () => screen.getAllByTestId('item').map((el) => el.textContent)
const spoken = () => document.querySelector('[data-ui-sdk-announcer="assertive"]')?.textContent

describe('Sortable keyboard reorder', () => {
  it('picks up with Space, moves with arrows, drops with Space: one commit, announced in our copy', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    screen.getByRole('button', { name: 'Maths' }).focus()

    await user.keyboard(' ')
    await waitFor(() => expect(spoken()).toBe('Picked up Maths board, position 1 of 4.'))
    await user.keyboard('{ArrowRight}')
    expect(names()).toEqual(['Physics', 'Maths', 'Chemistry', 'Biology'])
    await waitFor(() => expect(spoken()).toBe('Maths board moved to position 2 of 4'))
    expect(onChange).not.toHaveBeenCalled()

    await user.keyboard('{ArrowRight}{ArrowLeft}{ArrowRight}')
    await user.keyboard(' ')
    await waitFor(() => expect(spoken()).toBe('Maths board dropped at position 3 of 4'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(['physics', 'chem', 'maths', 'bio'])
    expect(names()).toEqual(['Physics', 'Chemistry', 'Maths', 'Biology'])
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Maths' })).toHaveFocus()
  })

  it('Enter also drops a picked-up item', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    screen.getByRole('button', { name: 'Physics' }).focus()
    await user.keyboard(' {ArrowLeft}{Enter}')
    expect(onChange).toHaveBeenCalledWith(['physics', 'maths', 'chem', 'bio'])
  })

  it('Escape puts it back: no commit, original order, announced', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    screen.getByRole('button', { name: 'Maths' }).focus()
    await user.keyboard(' {ArrowRight}{ArrowRight}{Escape}')
    expect(onChange).not.toHaveBeenCalled()
    expect(names()).toEqual(['Maths', 'Physics', 'Chemistry', 'Biology'])
    await waitFor(() => expect(spoken()).toBe('Move cancelled. Maths board is back at position 1 of 4'))
  })

  it('does not move past either end', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    screen.getByRole('button', { name: 'Maths' }).focus()
    await user.keyboard(' {ArrowLeft}{ArrowLeft} ')
    expect(onChange).not.toHaveBeenCalled()
    expect(names()).toEqual(['Maths', 'Physics', 'Chemistry', 'Biology'])
  })

  it('with enterActivates, Enter is left to the button; Space still picks up', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onClick = vi.fn()
    render(
      <Sortable aria-label="Boards" orientation="horizontal" value={['a', 'b']} onValueChange={onChange}>
        {({ order }) =>
          order.map((id) => (
            <SortableItem key={id} value={id}>
              <SortableHandle enterActivates onClick={onClick}>{id}</SortableHandle>
            </SortableItem>
          ))
        }
      </Sortable>,
    )
    screen.getByRole('button', { name: 'a' }).focus()
    await user.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(1)
    await user.keyboard(' ')
    await user.keyboard('{ArrowRight}')
    expect(document.querySelector('[data-moving]')).not.toBeNull()
  })

  it('describes the keys to a screen reader on each handle', () => {
    render(<Harness onChange={() => {}} />)
    const handle = screen.getByRole('button', { name: 'Maths' })
    expect(handle).toHaveAccessibleDescription(
      'Press Space to pick up. Left and right arrows move it. Space or Enter drops it. Escape cancels.',
    )
    expect(handle).toHaveAttribute('aria-roledescription', 'sortable item')
    expect(screen.getByRole('group', { name: 'Boards' })).toBeInTheDocument()
  })
})
