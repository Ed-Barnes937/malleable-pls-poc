# @pls/lens-resources

Resources widget: links and markdown notes a student keeps for a course or a lecture (uploads come later).

## Features

- Paste a link: Google Docs, Sheets, Slides, Forms and Drive files or folders are recognised from the URL (`parseResourceUrl` in `@pls/substrate`, no network) and labelled ("Google Sheet"); anything else is labelled by its host. http and https only. Links open in a new tab.
- Write a note: markdown, edited in Milkdown (headless core, our tokens) with a toolbar (bold, italic, heading, bulleted list, task list, link) and a **Markdown** toggle to edit the source. Autosaves after a pause ("Saving…", "Saved"), and at once when the page is hidden; leaving the note saves the last keystrokes, and reopening it before that save lands carries on from what was typed (`noteSavers.ts`). A save on top of a change made on another device is refused: "Changed on another device · Reload · Keep mine", with the note read-only until the student picks. Changes that won't save (a conflict, a failed save offline) are kept and the row says "Not saved"; leaving such a note, or the page, asks first.
- Rows: icon, title, what it is ("Google Doc", "Note · edited 2h ago", a note's first words), and More: Rename, Move (to a lecture, a course, or no course), Delete with Undo (5 seconds).
- On a phone, a note opens full screen.

## Scope

`courseTag: 'filter'` - the board course's resources (filed under the course or one of its lectures), with "+N in other courses". `lectureId: 'target'` - "This lecture" first, new items attach to it (or to the whole course, if picked), then the course's own, then the other lectures' under a collapsed group. Without a lecture: the course's own, then "In lectures (N)" by lecture; a lecture's title selects it on the board.

## The editor seam

`src/NoteEditor.tsx` is the only file that imports `@milkdown/*`, and it is loaded lazily on the first note opened, so the list view never downloads it. Notes are stored as markdown (`resources.body_md`), so the editor can be replaced without a migration. Raw HTML shows as escaped text and images as a link to the image; links open only for http, https and mailto.

## Internal Dependencies

`lens-framework`, `substrate`, `shared-ui`
