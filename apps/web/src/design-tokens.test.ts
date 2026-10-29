/**
 * Widgets style themselves only through the design tokens in index.css, so a
 * restyle (a type scale, a palette, the radii) stays one edit there.
 *
 * Every source file that renders UI (packages/lens-*, workspace-shell,
 * panel-system, shared-ui, and apps/web/src) is parsed as TSX. The checks
 * run on what the parser finds, never on comments or JSX text:
 *
 * - every string literal and template-literal part, for
 *   - text sizes that bypass the four type tokens (text-meta/body/title/
 *     heading): arbitrary (`text-[11px]`) or stock (`text-xs`, `text-sm`);
 *   - raw palette colours in any colour utility (`bg-neutral-800`,
 *     `text-white`, `ring-amber-200/15`, `inset-ring-black/10`,
 *     `text-shadow-white`) and colour literals in a utility (`bg-[#fff]`);
 *   - colour values anywhere in a string (`#fff`, `rgb(...)`, `oklch(...)`);
 *   - radius that bypasses the radius tokens (rounded-widget/control/item,
 *     rounded-track/tab/toast): bare `rounded`, stock sizes (`rounded-md`,
 *     `rounded-t-lg`) and arbitrary values (`rounded-[14px]`).
 *     `rounded-full` (pills, dots, avatars) and `rounded-none` (squaring off
 *     one side) are not a scale, so they stay;
 *   - `uppercase` (sentence-case labels only);
 * - inline styles: a literal `fontSize`, or a literal colour in `color`,
 *   `background`, `backgroundColor`, `borderColor`, `fill` or `stroke`
 *   (`var(--...)`, `currentColor`, `none`, `transparent` and `inherit` stay);
 * - SVG `fill` and `stroke` attributes with a literal colour (`currentColor`
 *   and `none` stay).
 *
 * Tests (unit and component) are exempt: they may pass any class through to
 * check it lands. The few deliberate exceptions are in ALLOWED, each with
 * its reason.
 *
 * The parser is Vite's `parseAst` (oxc, already a dependency): TypeScript 7
 * ships no JavaScript compiler API.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAst } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '../../..')
const packagesDir = path.join(repo, 'packages')

/** The packages that render UI. */
const UI_PACKAGE = /^(lens-.+|workspace-shell|panel-system|shared-ui)$/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (name === 'node_modules') return []
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(name) && !/\.(test|iwft)\.tsx?$/.test(name) ? [full] : []
  })
}

const uiFiles = [
  ...readdirSync(packagesDir)
    .filter((name) => UI_PACKAGE.test(name))
    .flatMap((name) => sourceFiles(path.join(packagesDir, name, 'src'))),
  ...sourceFiles(here),
]

type Rule =
  | 'arbitrary text size'
  | 'stock text size'
  | 'raw palette colour'
  | 'colour literal in a utility'
  | 'colour value'
  | 'raw radius'
  | 'uppercase label'
  | 'literal font size'
  | 'literal style colour'
  | 'literal svg paint'

interface Violation {
  file: string
  line: number
  rule: Rule
  match: string
}

/** Deliberate exceptions: [file (relative to the repo), rule, what matched, why]. */
const ALLOWED: [string, Rule, RegExp, string][] = [
  [
    'packages/panel-system/src/BackgroundPicker.tsx', 'colour value', /^oklch\(/,
    'board background presets the student picks: fixed swatches, not theme colours',
  ],
  [
    'packages/workspace-shell/src/WorkspaceSwitcher.tsx', 'colour value', /^#000$/,
    "the tab strip's edge-fade mask: a mask only reads alpha, so black is not a colour choice",
  ],
]

const PALETTE = 'white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const COLOR_UTILITY = 'bg|text|text-shadow|border(?:-[trblxyse])?|ring|ring-offset|inset-ring|outline|fill|stroke|from|via|to|divide|decoration|placeholder|caret|accent|shadow|inset-shadow'
const COLOR_FN = 'rgba?|hsla?|oklch|oklab|lab|lch'

/** Rules for the text of a string literal or template-literal part. */
const STRING_RULES: [Rule, RegExp][] = [
  ['arbitrary text size', /(?<![\w-])text-\[(?:length:)?[\d.]+(?:px|rem|em)\]/g],
  ['stock text size', /(?<![\w-])text-(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g],
  ['raw palette colour', new RegExp(`(?<![\\w-])(?:${COLOR_UTILITY})-(?:${PALETTE})(?:-\\d{2,3})?(?:/\\d+)?(?![\\w-])`, 'g')],
  ['colour literal in a utility', new RegExp(`(?<![\\w-])(?:${COLOR_UTILITY})-\\[(?:#|(?:${COLOR_FN})\\()`, 'g')],
  ['colour value', new RegExp(`#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\\w-])|(?<![\\w-])(?:${COLOR_FN})\\(`, 'g')],
  ['raw radius', /(?<![\w-])rounded(?:-(?:t|r|b|l|s|e|tl|tr|bl|br|ss|se|es|ee))?(?:-(?:xs|sm|md|lg|xl|[2-4]xl|\[[^\]]*\]))?(?![\w[-])/g],
  ['uppercase label', /(?<![\w-])uppercase(?![\w-])/g],
]

const STYLE_COLOR_KEYS = new Set(['color', 'background', 'backgroundColor', 'borderColor', 'fill', 'stroke'])
const SVG_PAINT_ATTRS = new Set(['fill', 'stroke'])
/**
 * A value that names no colour of its own: a token (`var(--x)`), a mix of
 * tokens (`color-mix(in oklab, var(--x) 25%, transparent)`), or a keyword.
 */
function notAColour(value: string): boolean {
  const rest = value
    .replace(/var\(--[\w-]+\)/g, '')
    .replace(/\b(?:color-mix|in|srgb|oklab|oklch|currentColor|none|transparent|inherit)\b/g, '')
    .replace(/[\d.]+%|[\s(),]/g, '')
  return rest === ''
}

// Loose ESTree shapes: only the fields the walk reads.
interface AstNode {
  type: string
  start: number
  [key: string]: unknown
}

const isNode = (v: unknown): v is AstNode => typeof v === 'object' && v !== null && typeof (v as AstNode).type === 'string'

function children(node: AstNode): AstNode[] {
  return Object.values(node).flatMap((v) => (Array.isArray(v) ? v.filter(isNode) : isNode(v) ? [v] : []))
}

/** Every string or number literal under a node (so both branches of `a ? 'x' : 'y'` count). */
function literalsUnder(node: AstNode): AstNode[] {
  return node.type === 'Literal' ? [node] : children(node).flatMap(literalsUnder)
}

const keyName = (key: unknown): string | undefined =>
  isNode(key) ? (key.type === 'Identifier' || key.type === 'JSXIdentifier' ? (key.name as string) : key.type === 'Literal' ? String(key.value) : undefined) : undefined

/** Every violation in `src`, a TSX module called `file`. */
function violations(file: string, src: string): Violation[] {
  const found: Violation[] = []
  const lineAt = (offset: number) => src.slice(0, offset).split('\n').length
  const report = (rule: Rule, match: string, at: number) => found.push({ file, line: lineAt(at), rule, match })

  const checkText = (text: string, at: number) => {
    for (const [rule, pattern] of STRING_RULES) {
      for (const m of text.matchAll(pattern)) report(rule, m[0], at)
    }
  }

  const walk = (node: AstNode) => {
    if (node.type === 'Literal' && typeof node.value === 'string') checkText(node.value, node.start)
    if (node.type === 'TemplateElement') checkText((node.value as { cooked?: string; raw: string }).cooked ?? (node.value as { raw: string }).raw, node.start)

    // Inline style keys, in any object literal (style={{ ... }} or a style
    // object built elsewhere); not destructuring defaults like `{ color = 'bg-accent' }`.
    const properties = node.type === 'ObjectExpression' ? (node.properties as AstNode[]).filter((p) => p.type === 'Property') : []
    for (const property of properties) {
      const key = keyName(property.key)
      if (key === 'fontSize' || (key && STYLE_COLOR_KEYS.has(key))) {
        for (const lit of literalsUnder(property.value as AstNode)) {
          const value = lit.value
          if (key === 'fontSize') {
            if (typeof value === 'number' || (typeof value === 'string' && /^[\d.]+(?:px|rem|em)?$/.test(value))) {
              report('literal font size', String(value), lit.start)
            }
          } else if (typeof value === 'string' && !notAColour(value)) {
            report('literal style colour', value, lit.start)
          }
        }
      }
    }

    // SVG paint attributes: fill="#333", stroke={'red'}.
    if (node.type === 'JSXAttribute' && SVG_PAINT_ATTRS.has(keyName(node.name) ?? '') && node.value) {
      for (const lit of literalsUnder(node.value as AstNode)) {
        if (typeof lit.value === 'string' && !notAColour(lit.value)) report('literal svg paint', lit.value, lit.start)
      }
    }

    for (const child of children(node)) walk(child)
  }

  walk(parseAst(src, { lang: 'tsx' }) as unknown as AstNode)
  return found
}

const rulesFired = (src: string) => [...new Set(violations('x.tsx', src).map((v) => v.rule))].sort()

describe('widgets use the design tokens', () => {
  it('finds the UI source', () => {
    const rel = uiFiles.map((f) => path.relative(repo, f))
    expect(rel).toContain('packages/lens-calendar/src/TimeGrid.tsx')
    expect(rel).toContain('packages/workspace-shell/src/WorkspaceShell.tsx')
    expect(rel).toContain('apps/web/src/App.tsx')
    expect(rel.filter((f) => /\.(test|iwft)\.tsx?$/.test(f))).toEqual([])
  })

  it('catches what it is meant to catch, with the right rule', () => {
    const bad: [string, Rule[]][] = [
      [`const c = 'text-[10px] font-medium'`, ['arbitrary text size']],
      [`const c = "rounded-item text-xs"`, ['stock text size']],
      ['const c = `md:text-sm ${x}`', ['stock text size']],
      [`const c = 'bg-neutral-800/40'`, ['raw palette colour']],
      [`const c = 'hover:text-white'`, ['raw palette colour']],
      [`const c = 'ring-1 ring-amber-200/15'`, ['raw palette colour']],
      [`const c = 'inset-ring inset-ring-black/10'`, ['raw palette colour']],
      [`const c = 'inset-shadow-sm inset-shadow-neutral-900'`, ['raw palette colour']],
      [`const c = 'text-shadow-white'`, ['raw palette colour']],
      [`const c = 'bg-[#ff0000]'`, ['colour literal in a utility', 'colour value']],
      [`const c = 'text-[rgb(1,2,3)]'`, ['colour literal in a utility', 'colour value']],
      [`const c = 'linear-gradient(#123456, transparent)'`, ['colour value']],
      [`const c = 'font-mono uppercase tracking-widest'`, ['uppercase label']],
      [`const c = 'rounded px-1.5'`, ['raw radius']],
      [`const c = "rounded-md bg-surface-overlay"`, ['raw radius']],
      ['const c = `hover:rounded-lg`', ['raw radius']],
      [`const c = 'rounded-t-lg'`, ['raw radius']],
      [`const c = 'rounded-[14px]'`, ['raw radius']],
      [`const c = 'rounded-[var(--radius-panel)]'`, ['raw radius']],
      // An apostrophe in JSX text doesn't hide the class string after it.
      [`const a = <p>Don't <span className="text-xs">x</span></p>`, ['stock text size']],
      // Nor does a lone backtick in a comment.
      ["// see `here\nconst c = 'bg-white'\n// and here", ['raw palette colour']],
      [`const a = <i style={{ fontSize: 11 }} />`, ['literal font size']],
      [`const a = <i style={{ fontSize: '11px' }} />`, ['literal font size']],
      [`const a = <i style={{ color: 'red' }} />`, ['literal style colour']],
      [`const a = <i style={{ background: on ? '#fff' : 'var(--color-surface)' }} />`, ['colour value', 'literal style colour']],
      [`const a = <path fill="red" />`, ['literal svg paint']],
      [`const a = <path stroke="#333" />`, ['colour value', 'literal svg paint']],
    ]
    for (const [src, rules] of bad) expect(rulesFired(src), src).toEqual([...rules].sort())

    const good = [
      `const c = 'text-meta font-semibold text-text-muted'`,
      `const c = 'bg-surface-overlay/60 text-attn ring-accent-line'`,
      `const c = 'bg-course-biology-tint text-course-biology-ink'`,
      `const c = 'bg-[color-mix(in_oklab,var(--glow)_18%,transparent)]'`,
      `const c = 'text-accent-foreground bg-accent'`,
      `// a comment about text-xs, bg-white and rounded-md is fine`,
      `const a = <p>Things to do, rounded up, in UPPERCASE</p>`,
      `const c = 'rounded-widget rounded-control rounded-item'`,
      `const c = 'rounded-track rounded-tab rounded-toast'`,
      `const c = 'h-2 w-2 rounded-full rounded-b-none rounded-t-none'`,
      `const a = <i style={{ fontSize: 'var(--text-meta)', color: 'var(--color-attn)', background: 'transparent' }} />`,
      `const a = <path fill="currentColor" stroke="none" />`,
      `const a = <i style={{ color: 'color-mix(in oklab, var(--color-text-primary) 25%, transparent)' }} />`,
      `function Bar({ color = 'bg-accent' }) { return color }`,
      `const a = <a href="#top">x</a>`,
    ]
    for (const src of good) expect(rulesFired(src), src).toEqual([])
  })

  it('has no arbitrary or stock sizes, raw colours, raw radius or uppercase labels', () => {
    const found = uiFiles
      .flatMap((file) => violations(path.relative(repo, file), readFileSync(file, 'utf8')))
      .filter((v) => !ALLOWED.some(([file, rule, match]) => v.file === file && v.rule === rule && match.test(v.match)))
      .map((v) => `${v.file}:${v.line}: ${v.rule}: ${v.match}`)
    expect(found).toEqual([])
  })

  it('needs every allowed exception it lists', () => {
    const all = uiFiles.flatMap((file) => violations(path.relative(repo, file), readFileSync(file, 'utf8')))
    const unused = ALLOWED.filter(([file, rule, match]) => !all.some((v) => v.file === file && v.rule === rule && match.test(v.match)))
    expect(unused.map(([file, rule]) => `${file}: ${rule}`)).toEqual([])
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
