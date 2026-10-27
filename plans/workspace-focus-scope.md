# Workspace Focus Scope — Option 1 Technical Plan

**Date:** 2026-06-08
**Status:** Ready to implement (revised after adversarial review — blocking fixes B1–B4 folded in)
**Scope:** Replace per-lens `config.recordingId` with a workspace-level `recordingId` focus scope dimension.

> **Review revisions folded in:** B1 — remove orphaned `useRecordings` calls in the two tool lenses
> (step 7). B2 — disambiguate the two `useRecordings`; edit only the shell-hooks copy (step 3).
> B3 — surface focus in the TopBar chip (step 8). B4 — move orphan-clear from a racy client
> double-mutate to a server-side transactional invariant in `setScope` (step 5). Plus: capture→focus
> limitation (S4, step 7), test renames (S3, step 9), connections-only-workspace picker note
> (S2, step 7), and the untrusted-`config.recordingId` caveat for Option 2.

---

## Problem

Each tool lens (transcript, audio-capture) and the connections view carry their own
`config.recordingId` with an in-panel picker, persisted per-panel via `updatePanelConfig`.
"Which recording am I looking at" is answered N times with no relationship between answers,
and each pick fires a `updatePanelConfig` mutation → invalidate → refetch chain (the source
of the `{"json":null}` / `undefined` response seen while debugging the transcript pane).

## Goal

One workspace-level **focus** (the currently-selected recording), set from a single picker in
the sidebar. All recording-consuming lenses read `scope.recordingId` and follow it. No per-panel
recording config, no per-panel pickers.

Non-goals (deferred to **Option 2**): per-panel pin/override for side-by-side comparison of two
recordings. This plan deliberately keeps `config.recordingId` *unused* rather than ripping the
column out, so Option 2 can reinterpret it as the pin.

---

## Settled decisions

1. **Connections lens is included** in focus-follow — reads `scope.recordingId` for its
   recording-connections; keeps `conceptLabel` as its own config; manifest gets `filters: ['recordingId']`.
2. **Course narrows the picker** — the recording picker lists only recordings in the active
   `courseTag` (all recordings when no course filter). When `courseTag` changes and the focused
   recording isn't in the new course, **clear** the focus (`recordingId → null`); tool lenses
   fall back to their pick/empty state. **No auto-jump.**

---

## Architecture note

The server `setScope` procedure (`apps/server/src/routers/workspaces.ts:180`) is already generic
— `scopeType` is an arbitrary string, `scopeValue` is `string | null`. Adding the new scope
dimension needs **no migration and no new procedure**. We use `scope_type = 'recording'`
(consistent with the existing `'tag'` / `'timeframe'` rows).

There is **one small server edit** (not zero, as an earlier draft claimed): `setScope` gains a
transactional invariant so that changing the course filter clears any focused recording
atomically — see step 5. This is the only server-side change; still no migration.

The recording picker filters by course via the existing `recordings.list` `courseTag` input
(`apps/server/src/routers/recordings.ts:19-26`) — no server change there.

---

## Changes

### 1. Scope type — `packages/lens-framework/src/types.ts`

```ts
export interface Scope {
  courseTag?: string
  timeframe?: 'week' | 'all'
  recordingId?: string          // + add
}

export type ScopeDim = 'courseTag' | 'timeframe' | 'recordingId'   // + add
```

### 2. Decode — `packages/substrate-client/src/shell-hooks.ts:9`

```ts
export function decodeScope(rows: ScopeRow[]): Scope {
  const scope: Scope = {}
  for (const s of rows) {
    if (s.scope_type === 'tag') scope.courseTag = s.scope_value
    if (s.scope_type === 'timeframe') scope.timeframe = s.scope_value as 'week' | 'all'
    if (s.scope_type === 'recording') scope.recordingId = s.scope_value   // + add
  }
  return scope
}
```

Encode side already works: `setScope.mutate({ scopeType: 'recording', scopeValue })`.

### 3. `useRecordings` accepts a course filter — `packages/substrate-client/src/shell-hooks.ts:104`

> **There are TWO `useRecordings` — edit only the shell-hooks one.**
> - **shell-hooks** (`shell-hooks.ts:104`): `useRecordings()`, no-arg. **Its only caller is the
>   barrel re-export** (`substrate-client/src/index.ts`); no real consumers today. This is the one
>   the sidebar picker will import — add the param here.
> - **contract/trpc** (`substrate-client/src/substrate-trpc.ts:15`): `useRecordings(filter?)` —
>   **already** accepts a filter and **already** forwards `courseTag`. The lenses call this one via
>   `substrate.useRecordings`. **Do not touch it.** (After step 7 the lenses stop calling it at all.)

Add the optional course filter to the shell-hooks version:

```ts
export function useRecordings(courseTag?: string) {
  return trpc.recordings.list.useQuery(courseTag ? { courseTag } : undefined)
}
```

The optional param is backwards-compatible (no-arg callers unaffected); the no-arg version has no
real callers anyway.

### 4. The single picker — `packages/workspace-shell/src/DrawerSidebar.tsx`

In `ScopeEditor` (line 41), add a **Recording** block gated on `activeDims.has('recordingId')`.
Unlike `COURSES`/`TIMEFRAMES` (hardcoded), options come from live data filtered by current course:

```tsx
const { data: recordings } = useRecordings(decodedScope.courseTag)
// ...
{activeDims.has('recordingId') && (
  <div>
    <SectionLabel className="mb-1">Recording</SectionLabel>
    <Select
      aria-label="Recording focus"
      value={decodedScope.recordingId ?? ''}
      onChange={(e) => handleChange('recording', e.target.value)}
    >
      <option value="">No recording selected</option>
      {recordings?.map((r) => (
        <option key={r.id} value={r.id}>{r.title}</option>
      ))}
    </Select>
  </div>
)}
```

`handleChange` already maps `''` → `null` (`scopeValue: value || null`), so "No recording
selected" clears the focus. Add the shell-hooks `useRecordings` to the import from
`@pls/substrate-client`. **The course `onChange` stays the plain `handleChange('tag', …)`** —
orphan-clearing is handled server-side (step 5), so no client-side logic is added here.

### 5. Clear orphaned focus on course change — SERVER-SIDE invariant in `setScope`

**(Revised — the earlier client-side double-mutate design was wrong.)**

The original draft fired two sequential `setScope.mutate` calls from the sidebar (`tag`, then
`recording=null`). That produces two POSTs → two `workspaces.scopes` invalidations → a transient
**torn state** where lenses read `{courseTag: new, recordingId: old}` — exactly the orphaned
combination we're trying to prevent. It trades a membership race for a write-ordering race.

Instead, enforce the invariant **atomically in the server transaction**. When the course (`tag`)
scope changes, clear the `recording` scope in the same `withUser` transaction
(`apps/server/src/routers/workspaces.ts:180`):

```ts
.mutation(async ({ ctx, input }) => {
  return withUser(ctx.userId, async (tx) => {
    // Invariant: changing the course filter orphans any focused recording
    // (it may not belong to the new course). Clear focus atomically so lenses
    // can never observe a {new course, stale recording} combination.
    if (input.scopeType === 'tag') {
      await tx`
        DELETE FROM workspace_scopes
        WHERE workspace_id = ${input.workspaceId}
          AND scope_type = 'recording' AND user_id = ${ctx.userId}
      `
    }
    // ... existing delete-then-insert (or delete-on-null) for input.scopeType
  })
}),
```

**Why this is better:**
- **One round-trip, one invalidation.** The client makes a single `setScope('tag', …)` call;
  its existing `workspaces.scopes` invalidation (`shell-hooks.ts:101`) refetches the scope list
  with the recording row already gone. No torn intermediate state.
- **Right layer.** It's an invariant of the scope model, not sidebar UI behaviour — any future
  caller of `setScope('tag', …)` inherits it for free.
- **Zero hand-rolled client logic.** Step 5 contributes no client code at all now.
- The picker's `useRecordings(courseTag)` query is keyed by course, so it refetches the new
  course's options automatically on the course change — no manual invalidation needed.

> **Behaviour note (matches the settled "predictable, no magic" decision):** focus is cleared on
> *every* course change, including re-selecting the same course or changing to a course that
> happens to contain the focused recording. This is intentional — no membership check, no
> async fetch-then-decide. If it feels too aggressive in use, a membership check is a localised
> follow-up, but it is explicitly out of scope here.

### 6. Manifests — declare the dependency

Add `recordingId` to `filters` so `useActiveScopeDims` (`DrawerSidebar.tsx:100`) surfaces the
picker only when a recording-consuming lens is on the canvas:

- `packages/lens-transcript/src/index.ts` → `filters: ['recordingId']`
- `packages/lens-audio-capture/src/index.ts` → `filters: ['recordingId']`
- `packages/lens-connections/src/index.ts` → `filters: ['recordingId']`

### 7. Tool lens components — read scope, delete in-panel pickers

> **B1 — delete the now-orphaned `useRecordings` calls.** In both transcript and audio-capture,
> `substrate.useRecordings()` exists *only* to populate the in-panel `<Select>`. When the Select
> goes, that query call **and** its `recordings` binding must be removed too, or you leave a dead
> query firing per panel + an unused-var error under `noUnusedLocals`. This is easy to miss —
> it's called out explicitly per lens below.

**`packages/lens-transcript/src/TranscriptLens.tsx`**
- Line 11: `const recordingId = scope.recordingId ?? ''` (was `config.recordingId`).
- Delete the in-panel recording `<Select>` (~lines 66-69) and its `onConfigChange`.
- **Delete `const { data: recordings } = substrate.useRecordings()` (line 17)** and the
  `recordings` variable — orphaned once the Select is gone.
- Keep `mode` from config (capture vs review) — that's not a recording axis.
- `useTags` / `useAnnotations` already spread `...scope`; `recordingId` now comes from scope, so
  `{ ...scope }` already carries it — drop the explicit `recordingId` in those calls as redundant.

**`packages/lens-audio-capture/src/AudioCaptureLens.tsx`**
- Line 46: `const recordingId = scope.recordingId ?? ''` (was `config.recordingId`).
- Delete the `recording-picker` `<Select>` (lines 70-82) and the `onConfigChange` wiring.
- **Delete `const { data: recordings } = substrate.useRecordings()` (line 48)** and the
  `recordings` variable — orphaned once the Select is gone.
- Empty `scope.recordingId` still means "start a new recording" — the existing idle/new path.
- `useAudioRecorder(recordingId)` and the `useEffect` that reflects picker changes
  (`useAudioRecorder.ts:24-28`) continue to work; the driving value is now scope, not config.
- **Capture→focus is out of scope (S4):** when a recording completes, `useAudioRecorder` sets a
  *local* new id (`setRecordingId(data.id)`, `useAudioRecorder.ts:122`) that is **not** written
  back to workspace focus. So a freshly captured recording does not auto-become the global focus —
  the user must pick it from the sidebar. This matches today's behaviour (the new id was never
  persisted either) but is more surprising now that focus is global. Documenting as a known
  limitation; wiring capture→`setScope('recording', newId)` is a deliberate follow-up, not part
  of Option 1.

**`packages/lens-connections/src/ConnectionsLens.tsx`**
- Line 30: `const recordingId = scope.recordingId` (was `config.recordingId`).
- Keep `conceptLabel = config.conceptLabel` unchanged (independent axis).
- Add `scope` to the destructured `LensProps` (currently only `{ config }`).
- Empty focus is already safe: `useRecordingConnections(recordingId)` is `enabled: !!recordingId`,
  so no query fires with no focus.
- **S2 side-effect to accept:** `useActiveScopeDims` unions `filters` across *all* panels
  regardless of category, so a workspace containing **only** a Connections view will now show the
  Recording picker. This is intended (the view does follow focus) but is a visible consequence of
  adding `recordingId` to a view-category manifest — flagged, not a bug.

### 8. TopBar scope chip — surface the focus (B3)

`TopBar.tsx` independently decodes scope into the summary chip via `useScopeSummary`
(`TopBar.tsx:15-27`), which has branches for `courseTag` and `timeframe` only. Without a change,
the focused recording — the *one* piece of global state this feature introduces — has **no global
indicator**: it's visible only in the sidebar picker, which is hidden when the drawer is collapsed.

**Decision: show the recording title in the chip.** `useScopeSummary` already only has the id, so
resolve it to a title via the (course-filtered) recordings list:

```tsx
function useScopeSummary(workspaceId: string): string | null {
  const { data: scopes } = useWorkspaceScopes(workspaceId)
  const s = decodeScope((scopes ?? []) as { scope_type: string; scope_value: string }[])
  const { data: recordings } = useRecordings(s.courseTag)   // shell-hooks version (step 3)
  return useMemo(() => {
    const parts: string[] = []
    if (s.courseTag) parts.push(s.courseTag)
    if (s.timeframe === 'week') parts.push('This week')
    else if (s.timeframe === 'all') parts.push('All time')
    if (s.recordingId) {
      const title = recordings?.find((r) => r.id === s.recordingId)?.title
      if (title) parts.push(title)
    }
    return parts.length > 0 ? parts.join(' · ') : null
  }, [s, recordings])
}
```

Note the hooks must move out of the `useMemo` (they already are) and `decodeScope` runs each
render — fine, it's trivial. If the title hasn't loaded yet the chip just omits it until the query
resolves (no flash of a raw id).

### 9. Component tests (`*.iwft.tsx`) — move `recordingId` from config to scope

The tool-lens component tests inject the recording via `config.recordingId`; after the refactor
they must inject via `scope.recordingId`:

- `packages/lens-transcript/src/TranscriptLens.iwft.tsx` — e.g. line 7-8:
  `scope: { recordingId: 'rec-bio-4' }`, `config: { mode: 'review' }`.
- `packages/lens-audio-capture/src/AudioCaptureLens.iwft.tsx` — **also rename the test** whose
  name references config (e.g. "…exists in config") so the name doesn't lie after the move.
- `packages/lens-connections/src/ConnectionsLens.iwft.tsx` — move the `recordingId` from config
  to scope (line ~11) and adjust the name/comment if it references config.

The "empty state when no recording selected" tests already pass `scope={{}} config={{}}` and
should keep passing unchanged.

---

## Not touched

- **DB / migrations** — none.
- **Server** — only the one `setScope` invariant (step 5); `recordings.list` is unchanged
  (already supports `courseTag`). No new procedures, no migration.
- **The trpc/contract `useRecordings`** (`substrate-trpc.ts:15`) — unchanged; only the
  shell-hooks copy is edited (step 3).
- **View lenses** without a recording axis (`weekly-overview`, `test-me`, `gap-analysis`,
  `weakest-topics`) — keep `courseTag` / `timeframe`, ignore `recordingId`.
- **`workspace_panels.config.recordingId`** — left in place but unused, reserved for Option 2's
  pin. See the Option 2 caveat below: existing rows will hold *stale* values, so it is **not** a
  reliable "is pinned" signal.

---

## Verification

1. **Build / typecheck** — `Scope.recordingId` flows through all consumers; no `config.recordingId`
   reads remain in transcript / audio-capture (connections keeps `conceptLabel` only); **no
   orphaned `substrate.useRecordings()` / `recordings` vars** remain in the two tool lenses
   (B1 — `noUnusedLocals` would otherwise fail the build).
2. **Component tests** — `pnpm test` (iwft) green after moving `recordingId` into `scope`; renamed
   tests no longer reference config.
3. **Manual (the bug that started this):**
   - Drop a transcript lens → sidebar shows a single **Recording** picker; the TopBar chip shows
     the focused recording's title once picked (B3).
   - Pick a recording → transcript + audio-capture + connections all update from *one* pick;
     network shows a single `setScope` POST, then GET refetches — **no** `updatePanelConfig`
     racing chain.
   - Switch course → focus clears in a **single** `setScope('tag')` POST (server clears the
     recording row in the same txn); tool lenses show their empty/pick state with no torn
     `{new course, old recording}` intermediate frame (B4); picker lists only the new course's
     recordings.
4. **Regression** — view lenses still respond to course/timeframe. Note (S2): a workspace with
   only a Connections view *will* show the Recording picker (connections follows focus) — expected.

---

## Follow-on: Option 2 (only if Option 1 feels right)

Add a per-panel **pin** that opts a panel out of focus-follow (restores two-recordings-side-by-side).
`config.recordingId` becomes the pin; `null` = "follow workspace focus". Needs a visible
pinned/following indicator on panel chrome. See memory `project_workspace_focus_scope`.

> **Caveat for Option 2 (from review):** Option 1 leaves existing `config.recordingId` values in
> the DB untouched (the lenses stop reading *and* writing them). So after Option 1 ships, a
> non-null `config.recordingId` is **stale leftover data, not a deliberate pin**. Option 2 must
> therefore either (a) ignore/clear all pre-existing `config.recordingId` as part of its rollout
> (a one-shot migration or lazy clear), or (b) introduce a distinct field (e.g.
> `config.pinnedRecordingId`) rather than overloading the old key. Do **not** assume
> "`config.recordingId` present ⇒ user pinned this panel."
