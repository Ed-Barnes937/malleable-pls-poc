/**
 * Text must stay readable in both themes.
 *
 * - Every design-token text pair (ink on surfaces, accent, fixed amber,
 *   status, course ink on its tints, shifts) is checked against WCAG AA in
 *   the light (`@theme`, the default) and dark (`[data-theme="dark"]`) themes. Add a row
 *   to TEXT_PAIRS for every new pair a widget uses.
 * - Amber ("needs another look") text: the light theme remaps the amber scale,
 *   so every `text-amber-*` / `text-attention*` / `text-attn` class the widgets
 *   use is checked against the panel surfaces, with its opacity and any amber
 *   tint drawn behind it in the same class list.
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

const COLOR_VALUE = /(?:oklch|color-mix|rgba?)\((?:[^()]|\([^)]*\))*\)|#[0-9a-fA-F]{3,8}\b|var\(--[\w-]+\)/

/** `name -> value` colour declarations in the first block whose selector matches. */
function tokens(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no ${selector} block`)
  const body = css.slice(start, css.indexOf('\n}', start))
  const decl = new RegExp(`--([\\w-]+):\\s*(${COLOR_VALUE.source})\\s*;`, 'g')
  return new Map([...body.matchAll(decl)].map((m) => [m[1]!, m[2]!]))
}

/**
 * A token as a colour and opacity: hex, `rgb[a](...)`, `oklch(...)`,
 * `var(--x)`, or `color-mix(in oklab, var(--x) N%, transparent)`.
 */
function resolve(theme: Map<string, string>, name: string): { rgb: Rgb; alpha: number } {
  const value = theme.get(name)
  if (!value) throw new Error(`no --${name}`)
  const alias = /^var\(--([\w-]+)\)$/.exec(value)
  if (alias) return resolve(theme, alias[1]!)
  const mix = /^color-mix\(in oklab, var\(--([\w-]+)\) ([\d.]+)%, transparent\)$/.exec(value)
  if (mix) {
    const base = resolve(theme, mix[1]!)
    return { rgb: base.rgb, alpha: base.alpha * (Number(mix[2]) / 100) }
  }
  return parseColor(value)
}

function parseColor(value: string): { rgb: Rgb; alpha: number } {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(value)
  if (hex) {
    const n = parseInt(hex[1]!, 16)
    return { rgb: [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255], alpha: 1 }
  }
  const rgba = /^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)$/.exec(value)
  if (rgba) {
    return {
      rgb: [Number(rgba[1]) / 255, Number(rgba[2]) / 255, Number(rgba[3]) / 255],
      alpha: rgba[4] === undefined ? 1 : Number(rgba[4]),
    }
  }
  return { rgb: oklchToRgb(value), alpha: 1 }
}

function oklchToRgb(value: string): Rgb {
  const m = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+|none)/.exec(value)
  if (!m) throw new Error(`not an oklch colour: ${value}`)
  const L = Number(m[1]) / (m[2] ? 100 : 1)
  const C = Number(m[3])
  const h = m[4] === 'none' ? 0 : (Number(m[4]) * Math.PI) / 180
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
    for (const literal of src.match(/'[^'\n]*(?:amber|attention|attn)[^'\n]*'|"[^"\n]*(?:amber|attention|attn)[^"\n]*"|`[^`\n]*(?:amber|attention|attn)[^`\n]*`/g) ?? []) {
      const tint = /\bbg-(amber-\d+|attn-soft)(?:\/(\d+))?(?![\w-])/.exec(literal)
      for (const m of literal.matchAll(/\btext-(amber-\d+|attention(?:-soft|-strong)?|attn)(?:\/(\d+))?(?![\w-])/g)) {
        uses.push({
          where: `${path.relative(repo, file)}: ${m[0]}`,
          token: `color-${m[1]}`,
          alpha: m[2] ? Number(m[2]) / 100 : 1,
          tint: tint ? { token: `color-${tint[1]}`, alpha: tint[2] ? Number(tint[2]) / 100 : 1 } : undefined,
        })
      }
    }
  }
  return uses
}

const stock = tokens(tailwindTheme, '@theme default')
const light = new Map([...stock, ...tokens(indexCss, '@theme')])
const dark = new Map([...light, ...tokens(indexCss, '[data-theme="dark"]')])
const themes = { light, dark }

/** The opaque colour a token paints over `bg` (a token with alpha composites over it). */
function paint(t: Map<string, string>, token: string, bg: Rgb): Rgb {
  const c = resolve(t, `color-${token}`)
  return over(c.rgb, c.alpha, bg)
}

function ratio(t: Map<string, string>, fg: string, bg: string): number {
  const ground = paint(t, 'surface-raised', [0, 0, 0])
  const back = paint(t, bg, ground)
  return contrast(paint(t, fg, back), back)
}

const SURFACES = ['surface', 'surface-raised', 'surface-inset', 'surface-overlay']
const COURSES = ['biology', 'chemistry', 'physics']

/** [text token, background token]: every pair must reach 4.5:1 in both themes. */
const TEXT_PAIRS: [string, string][] = [
  ...['text-primary', 'text-secondary', 'text-muted'].flatMap((ink) => SURFACES.map((s): [string, string] => [ink, s])),
  ['accent', 'surface-raised'],
  ['accent', 'surface-overlay'],
  ['accent', 'accent-soft'],
  ['accent-foreground', 'accent'],
  ['attn', 'surface-raised'],
  ['attn', 'attn-soft'],
  ['text-primary', 'attn-soft'],
  ['confused', 'surface-raised'],
  ['confused', 'confused-soft'],
  ['surface-raised', 'confused'],
  ['good', 'surface-raised'],
  ['good', 'good-soft'],
  ['inverse-foreground', 'inverse'],
  ['inverse-accent', 'inverse'],
  ['shift-ink', 'shift'],
  ['shift-ink', 'surface-raised'],
  ...COURSES.flatMap((c): [string, string][] => [
    [`course-${c}-ink`, `course-${c}-tint`],
    [`course-${c}-ink`, `course-${c}-soft`],
    [`course-${c}-ink`, 'surface-raised'],
    // A study block's quote of its lecture moment (Calendar popover) and a
    // landed moment (Transcript): the line and the mark that made it, on the
    // course's soft tint.
    ['text-primary', `course-${c}-soft`],
    ['confused', `course-${c}-soft`],
    ['attn', `course-${c}-soft`],
    ['accent', `course-${c}-soft`],
  ]),
]

/** [graphic token, background token]: non-text marks (stripes, dots, focus) need 3:1. */
const GRAPHIC_PAIRS: [string, string][] = [
  ['accent', 'surface-raised'],
  // Icon buttons that tint on hover (e.g. To-do's add button).
  ['accent', 'accent-line'],
  ...COURSES.flatMap((c): [string, string][] => [
    [`course-${c}`, 'surface-raised'],
    [`course-${c}`, `course-${c}-soft`],
    // (Tag marks on a landed moment's soft tint: covered by the text pairs above.)
  ]),
  ['confused', 'surface-raised'],
  ['attn', 'surface-raised'],
  // The scroll rail's marks sit on its track.
  ['confused', 'surface-overlay'],
  ['attn', 'surface-overlay'],
  ['accent', 'surface-overlay'],
]

describe('design token contrast', () => {
  for (const [theme, t] of Object.entries(themes)) {
    it(`every text pair is at least 4.5:1 in the ${theme} theme`, () => {
      const failures = TEXT_PAIRS
        .map(([fg, bg]) => ({ fg, bg, r: ratio(t, fg, bg) }))
        .filter(({ r }) => r < 4.5)
        .map(({ fg, bg, r }) => `${fg} on ${bg} ${r.toFixed(2)}:1`)
      expect(failures).toEqual([])
    })

    it(`every graphic pair is at least 3:1 in the ${theme} theme`, () => {
      const failures = GRAPHIC_PAIRS
        .map(([fg, bg]) => ({ fg, bg, r: ratio(t, fg, bg) }))
        .filter(({ r }) => r < 3)
        .map(({ fg, bg, r }) => `${fg} on ${bg} ${r.toFixed(2)}:1`)
      expect(failures).toEqual([])
    })
  }

  it('defines every token in both themes', () => {
    const lightOwn = tokens(indexCss, '@theme')
    const darkOwn = tokens(indexCss, '[data-theme="dark"]')
    // Every literal colour has a dark value (aliases like var(--x) follow
    // their target), and dark overrides nothing light lacks.
    const literals = [...lightOwn].filter(([, v]) => !v.startsWith('var(')).map(([k]) => k)
    expect(literals.filter((k) => !darkOwn.has(k))).toEqual([])
    expect([...darkOwn.keys()].filter((k) => !lightOwn.has(k))).toEqual([])
  })
})

describe('amber text contrast', () => {
  const uses = amberTextUses()

  it('finds the widgets that use amber text', () => {
    expect(uses.length).toBeGreaterThan(5)
  })

  it('leaves the dark theme on the stock amber scale', () => {
    const ambers = [...stock.keys()].filter((k) => k.startsWith('color-amber-'))
    expect(ambers.filter((k) => dark.get(k) !== stock.get(k))).toEqual([])
  })

  it('makes "attention" the same fixed, opaque amber as attn in both themes', () => {
    for (const t of Object.values(themes)) {
      for (const name of ['color-attention', 'color-attention-soft', 'color-attention-strong']) {
        expect(resolve(t, name)).toEqual(resolve(t, 'color-attn'))
      }
    }
  })

  for (const [theme, t] of Object.entries(themes)) {
    for (const surface of SURFACES.map((s) => `color-${s}`)) {
      it(`is at least 4.5:1 on ${surface} in the ${theme} theme`, () => {
        const failures: string[] = []
        for (const use of uses) {
          let bg = resolve(t, surface).rgb
          if (use.tint) {
            const tint = resolve(t, use.tint.token)
            bg = over(tint.rgb, tint.alpha * use.tint.alpha, bg)
          }
          const text = resolve(t, use.token)
          const r = contrast(over(text.rgb, text.alpha * use.alpha, bg), bg)
          if (r < 4.5) failures.push(`${use.where} ${r.toFixed(2)}:1`)
        }
        expect(failures).toEqual([])
      })
    }
  }
})
