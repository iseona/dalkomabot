# Adaptive party screenshot recognition — 2026-09-14

## Changes

- Removed screen-relative fixed card coordinates. Connected purple body pixels, dense rows and a coherent two-column/three-row grid determine the crop rectangles. Portraits protruding above a card no longer shift the text rows.
- Normalize padding to detected card dimensions. No source filename, image hash, expected answer, or particular resolution is used by this algorithm.
- Separate text from decorative slot numbers across large whitespace gaps. Unread text gets bounded contrast and crop-padding retries. Item X/Y suffixes still require separate observed glyph evidence.
- No model upgrade, Lambda change, automatic AI request, or statistical set completion.

## Validation

- `party-layout-adaptive.mjs`: 3 source pairs × 16 scale/padding/translation transforms = 96 geometry cases passed; maximum coordinate drift normalized to card width 0.85%. Six missing-card cases rejected. These are transformed development samples, not independent unseen-image accuracy claims.
- `live-party-page.mjs --local`: original, cross and ultrawide party pairs, each at original size, 1280px-wide JPEG and translated/padded JPEG: 9 runs × 84 fields = 756/756. All POST requests blocked; zero inference calls. Expected answers exist only under tests.
- Newly supplied PNG originals are 2520×1080. Their 1280px-wide variant preserves aspect ratio (about 549px high), rather than stretching to 16:9.
- Personally inspected all six original-ultrawide and all six reduced-ultrawide result screenshots against the user-provided originals. Gourgeist is small variety based on all six observed stat equations, not nickname or usage ranking.
- Erased move/HP: move stays blank, HP stays null and species stays unresolved; other observed values retained.
- Lead regression: 24/24 known-reference slots, zero inference calls. This is not proof of unseen lead-screen accuracy.
- Recognition schema, merge, cost routing, text validation, draft safety, reference-label integrity and changed-module syntax checks passed.
- Full `verify.mjs` remains blocked by the pre-existing backend WIP: test expects max_output_tokens 1600 while the uncommitted recognizer has 4000. That backend is excluded from this static-only release. No full-suite pass is claimed.

## Release boundary

Only `recognition-contact-sheet.mjs` and `local-party-text.mjs` are in the release package. Dependency graph and production master hash are checked before writes; prior static objects are backed up. Published-site checks recorded after deployment below.

The detector supports this card visual layout across resolution, scale and surrounding margins. Completely different UI themes/layouts, missing cards, or text too degraded to read are not guaranteed and must not silently produce invented values.
