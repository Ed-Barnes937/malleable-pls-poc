import { useCallback, useState } from 'react'
import { useCanvasStore, DEFAULT_BACKGROUND, type BackgroundConfig } from './canvas-store'

/* ── Preset solid colors (warm OKLch tones) ── */

export interface BackgroundPreset {
  label: string
  config: BackgroundConfig
}

export const SOLID_PRESETS: BackgroundPreset[] = [
  { label: 'Warm Sand', config: { type: 'solid', value: 'oklch(0.85 0.04 75)' } },
  { label: 'Muted Amber', config: { type: 'solid', value: 'oklch(0.78 0.06 65)' } },
  { label: 'Warm Gray', config: { type: 'solid', value: 'oklch(0.55 0.01 60)' } },
  { label: 'Soft Blue', config: { type: 'solid', value: 'oklch(0.75 0.06 240)' } },
  { label: 'Dusty Rose', config: { type: 'solid', value: 'oklch(0.72 0.06 10)' } },
  { label: 'Sage', config: { type: 'solid', value: 'oklch(0.70 0.04 145)' } },
]

export const GRADIENT_PRESETS: BackgroundPreset[] = [
  {
    label: 'Warm Sunset',
    config: { type: 'gradient', value: 'linear-gradient(135deg, oklch(0.78 0.08 55), oklch(0.65 0.10 25))' },
  },
  {
    label: 'Cool Dawn',
    config: { type: 'gradient', value: 'linear-gradient(135deg, oklch(0.80 0.05 240), oklch(0.70 0.06 280))' },
  },
  {
    label: 'Soft Aurora',
    config: { type: 'gradient', value: 'linear-gradient(135deg, oklch(0.75 0.06 170), oklch(0.68 0.08 280))' },
  },
  {
    label: 'Ember Glow',
    config: { type: 'gradient', value: 'linear-gradient(135deg, oklch(0.72 0.06 60), oklch(0.60 0.08 30))' },
  },
]

/* ── Component ── */

export function BackgroundPicker() {
  const background = useCanvasStore((s) => s.background)
  const setBackground = useCanvasStore((s) => s.setBackground)
  const [imageUrl, setImageUrl] = useState('')

  const handlePresetClick = useCallback(
    (e: React.MouseEvent, preset: BackgroundPreset) => {
      e.stopPropagation()
      setBackground(preset.config)
      setImageUrl('')
    },
    [setBackground],
  )

  const handleNoneClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setBackground(DEFAULT_BACKGROUND)
      setImageUrl('')
    },
    [setBackground],
  )

  const handleImageUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation()
      setImageUrl(e.target.value)
    },
    [],
  )

  const handleImageUrlKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation()
      if (e.key === 'Enter' && imageUrl.trim()) {
        setBackground({ type: 'image', value: imageUrl.trim() })
      }
    },
    [imageUrl, setBackground],
  )

  const handleImageUrlBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      e.stopPropagation()
      if (imageUrl.trim()) {
        setBackground({ type: 'image', value: imageUrl.trim() })
      }
    },
    [imageUrl, setBackground],
  )

  const stopPointerPropagation = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
  }, [])

  const isActive = (preset: BackgroundPreset) =>
    background.type === preset.config.type && background.value === preset.config.value

  return (
    <div
      data-testid="background-picker"
      className="space-y-3"
      onPointerDown={stopPointerPropagation}
    >
      <h3 className="text-body font-semibold text-text-primary">Background</h3>

      <button
        data-testid="bg-none"
        type="button"
        onClick={handleNoneClick}
        className="h-9 w-full rounded-control px-3 text-left text-body font-medium text-text-secondary transition-[background] hover:text-text-primary"
        style={{
          background:
            background.type === 'none'
              ? 'var(--color-surface-overlay)'
              : 'transparent',
        }}
      >
        None
      </button>

      <div>
        <p className="mb-1.5 text-meta font-semibold text-text-muted">Solids</p>
        <div
          data-testid="bg-solids"
          className="grid grid-cols-3 gap-1.5"
        >
          {SOLID_PRESETS.map((preset) => (
            <button
              key={preset.label}
              data-testid={`bg-solid-${preset.label.toLowerCase().replace(/\s+/g, '-')}`}
              type="button"
              onClick={(e) => handlePresetClick(e, preset)}
              aria-label={preset.label}
              title={preset.label}
              className="aspect-square rounded-item transition-[box-shadow]"
              style={{
                background: preset.config.value,
                boxShadow: isActive(preset)
                  ? '0 0 0 2px var(--color-accent)'
                  : '0 0 0 1px var(--color-border)',
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-meta font-semibold text-text-muted">Gradients</p>
        <div
          data-testid="bg-gradients"
          className="grid grid-cols-2 gap-1.5"
        >
          {GRADIENT_PRESETS.map((preset) => (
            <button
              key={preset.label}
              data-testid={`bg-gradient-${preset.label.toLowerCase().replace(/\s+/g, '-')}`}
              type="button"
              onClick={(e) => handlePresetClick(e, preset)}
              aria-label={preset.label}
              title={preset.label}
              className="aspect-[2/1] rounded-item transition-[box-shadow]"
              style={{
                background: preset.config.value,
                boxShadow: isActive(preset)
                  ? '0 0 0 2px var(--color-accent)'
                  : '0 0 0 1px var(--color-border)',
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-meta font-semibold text-text-muted">Image URL</p>
        <input
          data-testid="bg-image-url"
          type="url"
          placeholder="https://..."
          value={imageUrl}
          onChange={handleImageUrlChange}
          onKeyDown={handleImageUrlKeyDown}
          onBlur={handleImageUrlBlur}
          onPointerDown={stopPointerPropagation}
          className="h-9 w-full rounded-control border border-border px-3 text-body text-text-primary placeholder:text-text-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent-line"
          style={{
            background: 'var(--color-surface-raised)',
            transition: 'var(--transition-panel)',
          }}
        />
      </div>
    </div>
  )
}
