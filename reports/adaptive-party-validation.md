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

## Published verification

- Static files uploaded with backup `/home/cloudshell-user/recognition-release-backup-rniolpz8`; invalidation `I26PMUQY3VFTJ7NIWHXBXMKK9I` confirmed Completed.
- Public HTTP hashes match the tested manifest for both modules.
- Actual Edge browser: uploaded the user's original PNGs in reverse order (stats then ability); all 84 DOM values manually checked against source, local completion and zero-AI status displayed. Result tab left open without applying changes to the user's saved party.
- Published automated original/cross party checks and ultrawide reduced/translated checks each passed 84/84, zero POST requests.
- The first automated full-size ultrawide run immediately after deployment timed out. The test did not capture its status, so its cause is unconfirmed; it is not counted as a pass. Added timeout-status reporting and reran after cache invalidation completion.
- Fresh full-size ultrawide rerun passed 84/84 with zero POST requests. The queued reduced/translated runs also passed. Published verification therefore covers all three original source pairs plus ultrawide reduced and translated versions.

## Subsequent integration cleanup (no new deployment)

The earlier full-suite blocker is resolved by excluding the unsuccessful AI prompt/schema/budget experiments, not by relaxing the test. The existing 1600-token/no-reasoning fallback contract is preserved. Only deterministic whitespace normalization and preservation of unread move positions remain in the backend diff. `node tests/verify.mjs`, recognition schema and Python request tests now pass. Optional real AI inference accuracy is not claimed; this cleanup makes no API calls and performs no AWS deployment.
