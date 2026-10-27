/**
 * Amber ("needs another look") text must stay readable in both themes. The
 * light theme remaps the amber scale and the `attention` text tokens, so every
 * `text-amber-*` / `text-attention*` class the widgets use is checked against
 * the panel surfaces, with its opacity and any amber tint drawn behind it in
 * the same class list.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../../..')
const indexCss = readFileSync(path.join(here, 'index.css'), 'utf8')
const tailwindTheme = readFileSync(path.join(here, '../node_modules/tailwindcss/theme.css'), 'utf8')

type Rgb = [number, number, number]

/** `name -> value` colour declarations (oklch or color-mix) in the first block whose selector matches. */
function tokens(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no ${selector} block`)
  const body = css.slice(start, css.indexOf('\n}', start))
  return new Map([...body.matchAll(/--([\w-]+):\s*((?:oklch|color-mix)\((?:[^()]|\([^)]*\))*\))/g)].map((m) => [m[1]!, m[2]!]))
}

/** A token as a colour and opacity: `oklch(...)`, or `color-mix(in oklab, var(--x) N%, transparent)`. */
function resolve(theme: Map<string, string>, name: string): { rgb: Rgb; alpha: number } {
  const value = theme.get(name)
  if (!value) throw new Error(`no --${name}`)
  const mix = /^color-mix\(in oklab, var\(--([\w-]+)\) ([\d.]+)%, transparent\)$/.exec(value)
  if (!mix) return { rgb: oklchToRgb(value), alpha: 1 }
  const base = resolve(theme, mix[1]!)
  return { rgb: base.rgb, alpha: base.alpha * (Number(mix[2]) / 100) }
}

function oklchToRgb(value: string): Rgb {
  const m = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/.exec(value)
  if (!m) throw new Error(`not an oklch colour: ${value}`)
  const L = Number(m[1]) / (m[2] ? 100 : 1)
  const C = Number(m[3])
  const h = (Number(m[4]) * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const encode = (x: number) => {
    const c = Math.min(1, Math.max(0, x))
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  }
  return [
    encode(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s),
    encode(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s),
    encode(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s),
  ]
}

/** `fg` at `alpha` over an opaque `bg`, as the browser composites it. */
const over = (fg: Rgb, alpha: number, bg: Rgb): Rgb => fg.map((v, i) => v * alpha + bg[i]! * (1 - alpha)) as Rgb

function contrast(a: Rgb, b: Rgb): number {
  const lum = (c: Rgb) => {
    const lin = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (name === 'node_modules') return []
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(name) && !/\.(test|iwft)\.tsx?$/.test(name) ? [full] : []
  })
}

/** Every string literal using amber text, with the amber tint (if any) behind it. */
function amberTextUses(): { where: string; token: string; alpha: number; tint?: { token: string; alpha: number } }[] {
  const uses = []
  for (const file of sourceFiles(path.join(repo, 'packages'))) {
    const src = readFileSync(file, 'utf8')
    for (const literal of src.match(/'[^'\n]*(?:amber|attention)[^'\n]*'|"[^"\n]*(?:amber|attention)[^"\n]*"/g) ?? []) {
      const tint = /\bbg-(amber-\d+)\/(\d+)\b/.exec(literal)
      for (const m of literal.matchAll(/\btext-(amber-\d+|attention(?:-soft|-strong)?)(?:\/(\d+))?(?![\w-])/g)) {
        uses.push({
          where: `${path.relative(repo, file)}: ${m[0]}`,
          token: `color-${m[1]}`,
          alpha: m[2] ? Number(m[2]) / 100 : 1,
          tint: tint ? { token: `color-${tint[1]}`, alpha: Number(tint[2]) / 100 } : undefined,
        })
      }
    }
  }
  return uses
}

const dark = new Map([...tokens(tailwindTheme, '@theme default'), ...tokens(indexCss, '@theme')])
const light = new Map([...dark, ...tokens(indexCss, '[data-theme="light"]')])
const themes = { dark, light }

describe('amber text contrast', () => {
  const uses = amberTextUses()

  it('finds the widgets that use amber text', () => {
    expect(uses.length).toBeGreaterThan(5)
  })

  it('leaves the dark theme on the stock amber scale, faded as before', () => {
    expect([...tokens(indexCss, '@theme').keys()].filter((k) => k.startsWith('color-amber-'))).toEqual([])
    expect(resolve(dark, 'color-attention').alpha).toBeCloseTo(0.7)
  })

  for (const [theme, t] of Object.entries(themes)) {
    for (const surface of ['color-surface', 'color-surface-raised', 'color-surface-overlay']) {
      it(`is at least 4.5:1 on ${surface} in the ${theme} theme`, () => {
        const failures: string[] = []
        for (const use of uses) {
          let bg = oklchToRgb(t.get(surface)!)
          if (use.tint) {
            const tint = resolve(t, use.tint.token)
            bg = over(tint.rgb, tint.alpha * use.tint.alpha, bg)
          }
          const text = resolve(t, use.token)
          const ratio = contrast(over(text.rgb, text.alpha * use.alpha, bg), bg)
          if (ratio < 4.5) failures.push(`${use.where} ${ratio.toFixed(2)}:1`)
        }
        expect(failures).toEqual([])
      })
    }
  }
})
