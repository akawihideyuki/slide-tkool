# AGENTS.md

## Purpose
This repository contains a browser-based slide generator for YouTube videos and YouTube Shorts.

## Core rules
- Keep the editor usable without a build step.
- Prefer Vanilla HTML/CSS/JavaScript unless a dependency is clearly justified.
- Preserve the shared data model for 16:9 and 9:16; do not fork the editor into separate implementations.
- Keep rendering logic separated from UI/event logic.
- PNG export must render at the target resolution, not by screenshotting the scaled editor UI.
- Editing-only overlays such as selection frames and safe-area guides must never be included in exported PNGs.
- Do not hard-code user content into rendering logic.
- Keep project JSON backward-compatible where practical; bump `version` when the stored shape changes incompatibly.
- Input controls must not trigger canvas keyboard shortcuts while the user is typing.

## Target resolutions
- Landscape: 1920x1080 (16:9)
- Portrait: 1080x1920 (9:16)

## Files
- `index.html`: application shell and controls
- `styles.css`: editor appearance and responsive layout
- `js/model.js`: project/slide/element data structures and templates
- `js/renderer.js`: Canvas rendering, hit testing, thumbnails, PNG generation
- `js/storage.js`: IndexedDB autosave
- `js/app.js`: state, editing interactions, history, import/export

## Validation checklist
Before considering a change complete:
1. Confirm imports/paths still resolve.
2. Check both 16:9 and 9:16 rendering.
3. Check selection/movement and inspector edits.
4. Check PNG export excludes guides/selection overlays.
5. Check JSON save/load and autosave do not throw.
6. Check keyboard shortcuts are suppressed in input/select/textarea/contenteditable controls.
