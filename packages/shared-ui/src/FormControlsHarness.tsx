import { useState } from 'react'
import { Checkbox } from './Checkbox'
import { DatePicker } from './DatePicker'
import { SegmentedControl } from './SegmentedControl'
import { Switch } from './Switch'
import { Tabs, TabsList, TabsPanel, TabsTab } from './Tabs'
import { TimeInput } from './TimeInput'

/** Stateful fixtures for the form-control component tests. Not product code. */
export function FormControlsHarness() {
  const [on, setOn] = useState(true)
  const [tick, setTick] = useState(true)
  const [kind, setKind] = useState('study')
  const [time, setTime] = useState<string | null>('09:30')
  const [date, setDate] = useState<string | null>('2026-11-25')
  return (
    <div className="flex w-[380px] flex-col gap-4 bg-surface p-4 text-text-primary">
      <Switch checked={on} onCheckedChange={setOn} label="Enabled" />
      <Checkbox checked={tick} onCheckedChange={setTick}>Repeat weekly</Checkbox>
      <SegmentedControl
        label="Kind"
        value={kind}
        onValueChange={setKind}
        options={[
          { value: 'event', label: 'Event' },
          { value: 'study', label: 'Study' },
          { value: 'task', label: 'Task' },
        ]}
      />
      <Tabs defaultValue="day">
        <TabsList label="View">
          <TabsTab value="day">Day</TabsTab>
          <TabsTab value="week">Week</TabsTab>
        </TabsList>
        <TabsPanel value="day">Day panel</TabsPanel>
        <TabsPanel value="week">Week panel</TabsPanel>
      </Tabs>
      <TimeInput label="Starts" value={time} onValueChange={setTime} step={15} hourCycle={24} />
      <DatePicker label="Date" value={date} onValueChange={setDate} />
      <output data-testid="state">{JSON.stringify({ on, tick, kind, time, date })}</output>
    </div>
  )
}
