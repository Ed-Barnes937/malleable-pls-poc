/**
 * Widgets style themselves only through the design tokens in index.css, so a
 * restyle (a type scale, a palette) stays one edit there.
 *
 * Every class string in the UI packages (the widgets, the shell, the panel
 * system and the shared components) is checked for:
 * - text sizes that bypass the four type tokens (text-meta/body/title/heading):
 *   arbitrary (`text-[11px]`) or stock (`text-xs`, `text-sm`, ...);
 * - raw palette colours (`bg-neutral-800`, `text-white`, `ring-amber-200/15`)
 *   and colour literals (`bg-[#fff]`, `text-[rgb(...)]`), which ignore the
 *   light and dark themes;
 * - uppercase labels (sentence case only).
 * Tests are exempt: they may pass any class through to check it lands.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const packagesDir = path.resolve(here, '../../../packages')

/** The packages that render UI. */
const UI_PACKAGE = /^(lens-.+|workspace-shell|panel-system|shared-ui)$/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (name === 'node_modules') return []
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

const uiFiles = readdirSync(packagesDir)
  .filter((name) => UI_PACKAGE.test(name))
  .flatMap((name) => sourceFiles(path.join(packagesDir, name, 'src')))

const PALETTE = 'white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const COLOR_UTILITY = 'bg|text|border(?:-[trblxyse])?|ring|ring-offset|outline|fill|stroke|from|via|to|divide|decoration|placeholder|caret|accent|shadow'

/** [what is wrong, pattern]: each pattern is matched inside string literals only (not comments). */
const RULES: [string, RegExp][] = [
  ['arbitrary text size', /(?<![\w-])text-\[(?:length:)?[\d.]+(?:px|rem|em)\]/g],
  ['stock text size', /(?<![\w-])text-(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g],
  ['raw palette colour', new RegExp(`(?<![\\w-])(?:${COLOR_UTILITY})-(?:${PALETTE})(?:-\\d{2,3})?(?:/\\d+)?(?![\\w-])`, 'g')],
  ['colour literal', new RegExp(`(?<![\\w-])(?:${COLOR_UTILITY})-\\[(?:#|(?:rgba?|hsla?|oklch|oklab|lab|lch)\\()`, 'g')],
  ['uppercase label', /(?<![\w-])uppercase(?![\w-])/g],
]

const STRING_LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g

/** `file:line: rule: match` for every violation in `src` (exported shape kept simple for the self-test below). */
function violations(file: string, src: string): string[] {
  const found: string[] = []
  for (const literal of src.matchAll(STRING_LITERAL)) {
    for (const [rule, pattern] of RULES) {
      for (const m of literal[0].matchAll(pattern)) {
        const line = src.slice(0, literal.index! + m.index!).split('\n').length
        found.push(`${file}:${line}: ${rule}: ${m[0]}`)
      }
    }
  }
  return found
}

describe('widgets use the design tokens', () => {
  it('finds the UI packages', () => {
    expect(uiFiles.some((f) => f.includes(`${path.sep}lens-calendar${path.sep}`))).toBe(true)
    expect(uiFiles.some((f) => f.includes(`${path.sep}workspace-shell${path.sep}`))).toBe(true)
  })

  it('catches what it is meant to catch', () => {
    const bad = [
      `'text-[10px] font-medium'`,
      `"rounded text-xs"`,
      '`md:text-sm`',
      `'bg-neutral-800/40'`,
      `'hover:text-white'`,
      `'ring-1 ring-amber-200/15'`,
      `'bg-[#ff0000]'`,
      `'text-[rgb(1,2,3)]'`,
      `'font-mono uppercase tracking-widest'`,
    ]
    for (const src of bad) expect(violations('x.tsx', src), src).not.toEqual([])
    const good = [
      `'text-meta font-semibold text-text-muted'`,
      `'bg-surface-overlay/60 text-attn ring-accent-line'`,
      `'bg-course-biology-tint text-course-biology-ink'`,
      `'bg-[color-mix(in_oklab,var(--glow)_18%,transparent)]'`,
      `'text-accent-foreground bg-accent'`,
      `// a comment about text-xs and bg-white is fine`,
      `'Things to do'`,
    ]
    for (const src of good) expect(violations('x.tsx', src), src).toEqual([])
  })

  it('has no arbitrary or stock text sizes, raw colours or uppercase labels', () => {
    const found = uiFiles.flatMap((file) =>
      violations(path.relative(packagesDir, file), readFileSync(file, 'utf8')),
    )
    expect(found).toEqual([])
  })
})

describe('type tokens', () => {
  it('has nothing smaller than 12px', () => {
    const css = readFileSync(path.join(here, 'index.css'), 'utf8')
    const sizes = [...css.matchAll(/--text-([\w]+):\s*([\d.]+)px;/g)].map(([, name, px]) => ({ name, px: Number(px) }))
    expect(sizes.map((s) => s.name)).toEqual(['meta', 'body', 'title', 'heading'])
    expect(sizes.filter((s) => s.px < 12)).toEqual([])
  })
})
