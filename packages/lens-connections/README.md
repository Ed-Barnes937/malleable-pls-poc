# @pls/lens-connections

Lens for visualising concept relationships and cross-references across recordings.

## Features

- Display connections between concepts and recordings
- Relationship types: `same-concept`, `builds-on`, `related`, `references`, `example-of`
- Source icons for recordings and segments
- Filter by specific concept or show all in scope

## Scope

`lectureId: 'target'`, `courseTag: 'filter'` - shows the links out of all of the board lecture's recordings (the lecture is always in the board course) and the in-course connections of an optional concept label from config, saying "+N in other courses" for concept links it leaves out. Prompts to focus a lecture when neither is set.

## Internal Dependencies

`lens-framework`, `substrate`, `shared-ui`
