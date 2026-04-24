# @pls/panel-system

Responsive grid layout system for lens panels with drag-and-drop support.

## Overview

Wraps `react-grid-layout` to provide a panel grid where lenses can be arranged, resized, and reordered via drag-and-drop. Includes responsive width tracking and container queries for adaptive panel sizing.

## Components

| Component | Description |
|-----------|-------------|
| `PanelGrid` | Grid container — manages layout, drag-drop, and resize |
| `Panel` | Individual panel wrapper |

## Configuration

Default grid: 3 columns, 6 rows. Layout is persisted through the workspace system in `@pls/substrate`.

## Dependencies

- react-grid-layout
