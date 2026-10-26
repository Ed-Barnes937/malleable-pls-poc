# @pls/lens-connections

Lens for visualising concept relationships and cross-references across recordings.

## Features

- Display connections between concepts and recordings
- Relationship types: `same-concept`, `builds-on`, `related`, `references`, `example-of`
- Source icons for recordings and segments
- Filter by specific concept or show all in scope

## Scope

`recordingId: 'target'`, `courseTag: 'filter'` - shows connections of the focused lecture (and of an optional concept label from config), keeping only those whose other end is in the board course. Prompts to focus a lecture when neither is set.

## Internal Dependencies

`lens-framework`, `substrate`, `shared-ui`
