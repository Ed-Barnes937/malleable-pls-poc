# @pls/lens-weakest-topics

Lens showing a ranked list of the lowest-confidence topics.

## Features

- Top 8 weakest topics ranked by confidence
- Course and week context for each topic
- Confidence percentage with mini bar chart
- Colour-coded highlighting for the top 3

## Scope

`courseTag: 'filter'` - ranks only the board course's topics (ranked within the course) and shows "+N in other courses" for weak topics it leaves out.

## Internal Dependencies

`lens-framework`, `substrate`, `shared-ui`
