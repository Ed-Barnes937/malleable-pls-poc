/**
 * The note editor, and the only file that imports Milkdown: swapping editors
 * later (Tiptap, a plain textarea) replaces this file, and notes stay
 * markdown (`body_md`). Loaded lazily (ResourcesLens imports it with
 * `lazy`), so the list never pays for the editor.
 *
 * Milkdown's headless core with the CommonMark and GFM presets, styled with
 * our tokens (no theme package). Raw HTML shows as escaped text, images as a
 * link to the image, and links open only for http, https and mailto, in a
 * new tab. "Markdown" switches to the source in a plain textarea.
 */
import { useEffect, useRef, useState, type ComponentType, type FormEvent } from 'react'
import { Editor, defaultValueCtx, editorViewCtx, editorViewOptionsCtx, remarkStringifyOptionsCtx, rootCtx, serializerCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import {
  commonmark,
  headingSchema,
  listItemSchema,
  toggleEmphasisCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  turnIntoTextCommand,
} from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { history } from '@milkdown/kit/plugin/history'
import { Plugin } from '@milkdown/kit/prose/state'
import type { EditorState } from '@milkdown/kit/prose/state'
import type { Mark, MarkType, Node as ProseNode, NodeType, Slice } from '@milkdown/kit/prose/model'
import { Fragment, Slice as ProseSlice } from '@milkdown/kit/prose/model'
import { $prose, callCommand, getMarkdown, replaceAll } from '@milkdown/kit/utils'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { cn } from '@pls/shared-ui'
import { Bold, Code2, Heading2, Italic, Link2, List, ListChecks } from 'lucide-react'

export interface NoteEditorProps {
  /** Markdown to start from. Read once, on mount; remount (a new `key`) to load other text. */
  value: string
  /** The markdown after each change. */
  onChange: (markdown: string) => void
  /** Shows the note without letting it be changed (no toolbar). */
  readOnly?: boolean
  /** Accessible name of the editing area, e.g. the note's title. */
  label?: string
}

/** Link schemes a note may open. Anything else stays text. */
const SAFE_LINK = /^(https?:|mailto:)/i

export function isSafeHref(href: unknown): href is string {
  return typeof href === 'string' && SAFE_LINK.test(href.trim())
}

/**
 * Our tokens on the editor's content. Descendant selectors, since ProseMirror
 * renders plain elements.
 */
const CONTENT = cn(
  '[&_.ProseMirror]:min-h-full [&_.ProseMirror]:whitespace-pre-wrap [&_.ProseMirror]:break-words [&_.ProseMirror]:pb-6 [&_.ProseMirror]:text-body [&_.ProseMirror]:text-text-primary [&_.ProseMirror]:outline-none',
  '[&_.ProseMirror>*:first-child]:mt-0',
  '[&_.ProseMirror_p]:my-2',
  '[&_.ProseMirror_h1]:mb-2 [&_.ProseMirror_h1]:mt-4 [&_.ProseMirror_h1]:text-heading [&_.ProseMirror_h1]:font-semibold',
  '[&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h2]:mt-4 [&_.ProseMirror_h2]:text-title [&_.ProseMirror_h2]:font-semibold',
  '[&_.ProseMirror_h3]:mb-1 [&_.ProseMirror_h3]:mt-3 [&_.ProseMirror_h3]:text-body [&_.ProseMirror_h3]:font-semibold',
  '[&_.ProseMirror_h4]:mt-3 [&_.ProseMirror_h4]:font-semibold [&_.ProseMirror_h5]:font-semibold [&_.ProseMirror_h6]:font-semibold',
  '[&_.ProseMirror_strong]:font-semibold [&_.ProseMirror_em]:italic [&_.ProseMirror_del]:line-through',
  '[&_.ProseMirror_code]:rounded-item [&_.ProseMirror_code]:bg-surface-inset [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:font-mono',
  '[&_.ProseMirror_pre]:my-2 [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:rounded-control [&_.ProseMirror_pre]:bg-surface-inset [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:font-mono',
  '[&_.ProseMirror_pre_code]:bg-transparent [&_.ProseMirror_pre_code]:p-0',
  '[&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6',
  '[&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6',
  '[&_.ProseMirror_li>p]:my-0.5',
  // Task items: a box before the text, ticked when done.
  '[&_.ProseMirror_li[data-item-type=task]]:-ml-6 [&_.ProseMirror_li[data-item-type=task]]:flex [&_.ProseMirror_li[data-item-type=task]]:list-none [&_.ProseMirror_li[data-item-type=task]]:items-start [&_.ProseMirror_li[data-item-type=task]]:gap-2',
  "[&_.ProseMirror_li[data-item-type=task]]:before:mt-1 [&_.ProseMirror_li[data-item-type=task]]:before:h-3.5 [&_.ProseMirror_li[data-item-type=task]]:before:w-3.5 [&_.ProseMirror_li[data-item-type=task]]:before:shrink-0 [&_.ProseMirror_li[data-item-type=task]]:before:rounded-item [&_.ProseMirror_li[data-item-type=task]]:before:border [&_.ProseMirror_li[data-item-type=task]]:before:border-border [&_.ProseMirror_li[data-item-type=task]]:before:content-['']",
  '[&_.ProseMirror_li[data-checked=true]]:before:border-good [&_.ProseMirror_li[data-checked=true]]:before:bg-good [&_.ProseMirror_li[data-checked=true]]:text-text-muted [&_.ProseMirror_li[data-checked=true]]:line-through',
  '[&_.ProseMirror_blockquote]:my-2 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-border [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:text-text-secondary',
  '[&_.ProseMirror_a]:text-accent [&_.ProseMirror_a]:underline',
  '[&_.ProseMirror_hr]:my-4 [&_.ProseMirror_hr]:border-border',
  '[&_.ProseMirror_table]:my-2 [&_.ProseMirror_table]:border-collapse',
  '[&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-border [&_.ProseMirror_td]:px-2 [&_.ProseMirror_td]:py-1',
  '[&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-border [&_.ProseMirror_th]:bg-surface-inset [&_.ProseMirror_th]:px-2 [&_.ProseMirror_th]:py-1 [&_.ProseMirror_th]:font-semibold',
  // Raw HTML stays visible as source, never rendered.
  '[&_.ProseMirror_[data-type=html]]:font-mono [&_.ProseMirror_[data-type=html]]:text-text-muted',
)

/** A link mark as an anchor that only opens safe schemes, in a new tab. */
function linkView(mark: Mark) {
  const a = document.createElement('a')
  const href = mark.attrs.href as unknown
  if (isSafeHref(href)) {
    a.href = href
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
  }
  if (typeof mark.attrs.title === 'string' && mark.attrs.title) a.title = mark.attrs.title
  return { dom: a }
}

/** An image as a link to it: kept in the markdown, never loaded into the page. */
function imageView(node: ProseNode) {
  const src = node.attrs.src as unknown
  const label = (node.attrs.alt as string) || (typeof src === 'string' ? src : '') || 'Image'
  const dom = document.createElement(isSafeHref(src) ? 'a' : 'span')
  dom.textContent = `Image: ${label}`
  dom.setAttribute('data-type', 'image')
  if (dom instanceof HTMLAnchorElement && isSafeHref(src)) {
    dom.href = src
    dom.target = '_blank'
    dom.rel = 'noopener noreferrer'
  }
  return { dom }
}

/** Typing or pasting a top-level heading makes it a section heading (h2). */
const sectionHeadings = $prose((ctx) => {
  const heading = headingSchema.type(ctx)
  return new Plugin({
    appendTransaction(transactions, _old, state) {
      if (!transactions.some((tr) => tr.docChanged)) return null
      const tr = state.tr
      state.doc.descendants((node, pos) => {
        if (node.type === heading && node.attrs.level === 1) tr.setNodeMarkup(pos, undefined, { ...node.attrs, level: 2 })
      })
      return tr.docChanged ? tr : null
    },
  })
})

/** Pasted links with a scheme we don't open (javascript:, data:, ...) arrive as plain text. */
const safePastedLinks = $prose(
  () =>
    new Plugin({
      props: {
        transformPasted(slice: Slice) {
          const strip = (fragment: Fragment): Fragment => {
            const nodes: ProseNode[] = []
            fragment.forEach((node) => {
              const marks = node.marks.filter((m) => m.type.name !== 'link' || isSafeHref(m.attrs.href))
              nodes.push(node.isText ? node.mark(marks) : node.copy(strip(node.content)).mark(marks))
            })
            return Fragment.fromArray(nodes)
          }
          return new ProseSlice(strip(slice.content), slice.openStart, slice.openEnd)
        },
      },
    }),
)

/** How long typing pauses before the markdown is serialised and reported. */
const REPORT_DELAY_MS = 200

/**
 * Reports the markdown after changes, once typing pauses, and at once when
 * the editor is destroyed (leaving the note), so the last keystrokes are
 * never dropped. (Milkdown's listener plugin cancels its pending report on
 * destroy.)
 */
function markdownChanges(onChange: () => (markdown: string) => void) {
  return $prose(
    (ctx) =>
      new Plugin({
        view: (view) => {
          let timer: ReturnType<typeof setTimeout> | null = null
          let reported = view.state.doc
          // Held from the start: by the time the view is destroyed, Milkdown has already
          // taken the serializer out of its context.
          const serialize = ctx.get(serializerCtx)
          const report = () => {
            if (timer) clearTimeout(timer)
            timer = null
            const doc = view.state.doc
            if (doc.eq(reported)) return
            reported = doc
            onChange()(serialize(doc))
          }
          return {
            update: (_view, prev) => {
              if (view.state.doc.eq(prev.doc)) return
              if (timer) clearTimeout(timer)
              timer = setTimeout(report, REPORT_DELAY_MS)
            },
            destroy: report,
          }
        },
      }),
  )
}

interface Active {
  bold: boolean
  italic: boolean
  heading: boolean
  bulletList: boolean
  taskList: boolean
  link: boolean
}

const NOTHING_ACTIVE: Active = { bold: false, italic: false, heading: false, bulletList: false, taskList: false, link: false }

function markActive(state: EditorState, type: MarkType | undefined): boolean {
  if (!type) return false
  const { from, to, empty, $from } = state.selection
  return empty ? !!type.isInSet(state.storedMarks ?? $from.marks()) : state.doc.rangeHasMark(from, to, type)
}

/** Depth of the innermost ancestor of the selection of `type`, or -1. */
function ancestorDepth(state: EditorState, type: NodeType | undefined): number {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === type) return d
  return -1
}

function activeIn(state: EditorState): Active {
  const { marks, nodes } = state.schema
  const item = ancestorDepth(state, nodes.list_item)
  return {
    bold: markActive(state, marks.strong),
    italic: markActive(state, marks.emphasis),
    heading: state.selection.$from.parent.type === nodes.heading,
    bulletList: ancestorDepth(state, nodes.bullet_list) >= 0,
    taskList: item >= 0 && state.selection.$from.node(item).attrs.checked != null,
    link: markActive(state, marks.link),
  }
}

/** Makes the list item at the selection a task (or back), wrapping it in a list first if needed. */
function toggleTask(ctx: Ctx) {
  const view = ctx.get(editorViewCtx)
  const itemType = listItemSchema.type(ctx)
  if (ancestorDepth(view.state, itemType) < 0) callCommand(wrapInBulletListCommand.key)(ctx)
  const depth = ancestorDepth(view.state, itemType)
  if (depth < 0) return
  const { $from } = view.state.selection
  const item = $from.node(depth)
  view.dispatch(view.state.tr.setNodeMarkup($from.before(depth), undefined, { ...item.attrs, checked: item.attrs.checked == null ? false : null }))
}

function MilkdownEditor({ value, onChange, readOnly, label, onActive, onReady }: NoteEditorProps & {
  onActive: (active: Active) => void
  onReady: (editor: Editor) => void
}) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly
  const onActiveRef = useRef(onActive)
  onActiveRef.current = onActive

  const { get } = useEditor((root) => {
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, value)
        // "- item", as most notes (and our seeds) write lists.
        ctx.update(remarkStringifyOptionsCtx, (prev) => ({ ...prev, bullet: '-' as const }))
        ctx.update(editorViewOptionsCtx, (prev) => ({
          ...prev,
          editable: () => !readOnlyRef.current,
          attributes: { 'aria-label': label ?? 'Note', 'aria-multiline': 'true', role: 'textbox', spellcheck: 'true' },
          markViews: { link: linkView },
          nodeViews: { image: imageView },
        }))
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(markdownChanges(() => onChangeRef.current))
      .use(sectionHeadings)
      .use(safePastedLinks)
      // Tells the toolbar what the selection is in, after every change.
      .use($prose(() => new Plugin({
        view: () => ({ update: (view) => onActiveRef.current(activeIn(view.state)) }),
      })))
    return editor
  }, [])

  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  useEffect(() => {
    // The editor is created asynchronously after mount.
    let cancelled = false
    const check = () => {
      if (cancelled) return
      const editor = get()
      if (editor) onReadyRef.current(editor)
      else requestAnimationFrame(check)
    }
    check()
    return () => {
      cancelled = true
    }
  }, [get])

  // The editor reads `editable` when its props change; nudge it.
  useEffect(() => {
    get()?.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      view.setProps({ editable: () => !readOnly })
    })
  }, [readOnly, get])

  return <Milkdown />
}

function ToolbarButton({ icon: Icon, label, pressed, onClick, disabled }: {
  icon: ComponentType<{ className?: string }>
  label: string
  pressed: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      // Keep the editor's selection: the command acts on it.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-item transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        pressed ? 'bg-accent-soft text-accent' : 'text-text-muted hover:bg-surface-overlay hover:text-text-primary',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

export default function NoteEditor({ value, onChange, readOnly = false, label }: NoteEditorProps) {
  const editorRef = useRef<Editor | null>(null)
  const [active, setActive] = useState<Active>(NOTHING_ACTIVE)
  const [ready, setReady] = useState(false)
  // Raw markdown mode: the textarea holds the source; the editor gets it back on return.
  const [source, setSource] = useState<string | null>(null)
  const [linkDraft, setLinkDraft] = useState<string | null>(null)
  // The text the editor would restart from if remounted: what it last reported.
  const latest = useRef(value)

  const change = (markdown: string) => {
    latest.current = markdown
    onChange(markdown)
  }

  const run = (fn: (ctx: Ctx) => void) => {
    editorRef.current?.action((ctx) => {
      fn(ctx)
      ctx.get(editorViewCtx).focus()
    })
  }

  const showSource = () => {
    const editor = editorRef.current
    setSource(editor ? editor.action(getMarkdown()) : latest.current)
    setLinkDraft(null)
  }

  const showRendered = () => {
    const text = source ?? ''
    setSource(null)
    // The editor stays mounted (hidden) while the source shows; give it the edited text.
    editorRef.current?.action(replaceAll(text))
  }

  const applyLink = (e: FormEvent) => {
    e.preventDefault()
    const href = (linkDraft ?? '').trim()
    if (!isSafeHref(href)) return
    run((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { state } = view
      const linkType = state.schema.marks.link
      if (state.selection.empty) {
        view.dispatch(state.tr.insertText(href).addMark(state.selection.from, state.selection.from + href.length, linkType.create({ href })))
      } else {
        callCommand(toggleLinkCommand.key, { href })(ctx)
      }
    })
    setLinkDraft(null)
  }

  const raw = source !== null
  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-testid="note-editor">
      {!readOnly && (
        <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-1 border-b border-border-subtle pb-1">
          <ToolbarButton icon={Bold} label="Bold" pressed={!raw && active.bold} disabled={raw || !ready} onClick={() => run((ctx) => callCommand(toggleStrongCommand.key)(ctx))} />
          <ToolbarButton icon={Italic} label="Italic" pressed={!raw && active.italic} disabled={raw || !ready} onClick={() => run((ctx) => callCommand(toggleEmphasisCommand.key)(ctx))} />
          <ToolbarButton
            icon={Heading2}
            label="Heading"
            pressed={!raw && active.heading}
            disabled={raw || !ready}
            onClick={() => run((ctx) => callCommand(active.heading ? turnIntoTextCommand.key : wrapInHeadingCommand.key, 2)(ctx))}
          />
          <ToolbarButton
            icon={List}
            label="Bulleted list"
            pressed={!raw && active.bulletList && !active.taskList}
            disabled={raw || !ready}
            onClick={() => run((ctx) => callCommand(wrapInBulletListCommand.key)(ctx))}
          />
          <ToolbarButton icon={ListChecks} label="Task list" pressed={!raw && active.taskList} disabled={raw || !ready} onClick={() => run(toggleTask)} />
          <ToolbarButton
            icon={Link2}
            label="Link"
            pressed={!raw && (active.link || linkDraft !== null)}
            disabled={raw || !ready}
            onClick={() => {
              if (active.link) run((ctx) => callCommand(toggleLinkCommand.key)(ctx))
              else setLinkDraft((d) => (d === null ? '' : null))
            }}
          />
          <button
            type="button"
            aria-pressed={raw}
            title={raw ? 'Back to the formatted note' : 'Edit the markdown source'}
            onClick={raw ? showRendered : showSource}
            disabled={!ready}
            className={cn(
              'ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-item px-2 text-meta font-semibold transition-colors disabled:opacity-40',
              raw ? 'bg-accent-soft text-accent' : 'text-text-muted hover:bg-surface-overlay hover:text-text-primary',
            )}
          >
            <Code2 className="h-4 w-4" aria-hidden />
            Markdown
          </button>
        </div>
      )}
      {linkDraft !== null && !raw && (
        <form onSubmit={applyLink} className="flex items-center gap-2">
          <input
            autoFocus
            type="url"
            aria-label="Link address"
            placeholder="https://"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setLinkDraft(null)}
            className="h-8 min-w-0 flex-1 rounded-control border border-border bg-surface-raised px-2 text-body text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line"
          />
          <button
            type="submit"
            disabled={!isSafeHref(linkDraft.trim())}
            className="h-8 shrink-0 rounded-control bg-accent px-3 text-meta font-semibold text-accent-foreground disabled:opacity-40"
          >
            Add link
          </button>
        </form>
      )}
      {raw && (
        <textarea
          aria-label="Markdown source"
          value={source ?? ''}
          onChange={(e) => {
            setSource(e.target.value)
            change(e.target.value)
          }}
          spellCheck
          className="min-h-0 flex-1 resize-none rounded-control border border-border bg-surface-raised p-3 font-mono text-body text-text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line"
        />
      )}
      <div className={cn('min-h-0 flex-1 overflow-y-auto', CONTENT, raw && 'hidden')}>
        <MilkdownProvider>
          <MilkdownEditor
            value={value}
            onChange={change}
            readOnly={readOnly}
            label={label}
            onActive={setActive}
            onReady={(editor) => {
              editorRef.current = editor
              setReady(true)
            }}
          />
        </MilkdownProvider>
      </div>
    </div>
  )
}
