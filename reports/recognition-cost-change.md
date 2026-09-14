# Recognition cost and top-meta validation — 2026-09-14

Workspace: Downloads/champs/dalkombot. Source defaults changed; no deployment or paid API calls in this change.

## Behavior

Final local-first path: lead uploads do not automatically fall back to paid inference. They use a local module Worker and non-neural masked-colour template comparison against 235 icon references. The explicit AI-assist button opts into one request when exact local recognition is incomplete. Party detail inference is unchanged. Template rankings remain user-confirmation candidates.

Final real-image Worker evaluation with all exact references excluded: 43 labeled slots and 5 unknown slots across four screenshots; top-1 27/43 (62.8%), top-5 33/43 (76.7%), template automatic confirmations 0. Browser tests pass worker loading, original 512px display, visible crops, zero default POSTs and one explicitly requested mocked POST. No paid requests were made. These are development-set candidate metrics, not general final recognition accuracy or an untouched acceptance set.

Rejected experiment: ridge classifier 127 classes/7248 examples scored top-1 10/43 and top-5 27/43. Expansion to 235 classes/12432 examples (767980-byte weights) scored 6/43 and 16/43. The learned classifier is retained for reproducibility but is NOT fetched or used by the app. Plain template comparison scored 26/43 and 33/43 in the main-thread benchmark; the actual Worker bitmap/resize path scored 27/43 and 33/43. Prefer the runtime measurement. This does not isolate the effect of DB expansion alone.

Display-image update: after explicit user instructions to download for personal local use, cached all 316 master species/forms as original 512x512 WebP files (7844470 bytes total). Exact form labels were checked from the source's public list/form metadata; URLs, dimensions and hashes are in champions-image-catalog.json. Shared renderer loads champions-image-map.json instead of four PokeAPI maps; smoothing uses auto rather than pixelated. Current-mode recognition references cover 235/235 names, up from 127. No PokeAPI images were downloaded; its species index supplied image identity crosswalk IDs only. No battle stats were imported from it. Old unused PokeAPI files were preserved. Downloads were sequential with brief spacing, cached/restartable, and no access-control bypass. No deployment, commit or push. See champions-image-inventory.json.

- Recognition defaults: gpt-5.6-luna, reasoning none; matching Lambda, CloudFormation and deploy CLI defaults.
- AI-assist button: skip inference if all 12 slots have separated near-exact matches with six distinct species per side; default uploads never request external inference.
- No whole-screen fixture-signature lookup of slot names. Generic local scores only propose candidates.
- Conflicting local/model names and model confidence below 0.8 remain unresolved. This threshold is conservative, not a calibrated probability.
- Session cache keyed by exact image SHA-256, mode, kind and endpoint; in-flight requests deduplicated; errors not cached.
- Party detail recognition still needs the model. Unknown fields are not filled from popular sets during automatic recognition.
- Party input-layout instructions updated to the actual six-row contact sheet. Server rejects EV sums above 66.
- User confirmed top 20 meta species per current mode. Analysis computes outgoing/incoming damage and speed scenarios and labels missing evidence incomplete. Source guidance updated.

## Checks

Passed: recognition schema/manifest, merge policy, real-image cost-routing browser test, both-mode top-20 validation, Python request/EV checks, full tests/verify.mjs, JS syntax.

The browser test decodes a real fixture, prepares the contact sheet, verifies cache/dedup behavior using stubbed inference and erases an icon to verify that its old species is not inferred from the background.

NOT PASSED: tests/recognition-fixture-acceptance.mjs stops at lead-validation-02.png, opponent slot 1: expected 라우드본, actual empty. This is a local-only coverage gap; now user confirmation or explicit AI assist is required. Do not loosen thresholds to make this gate green.

No new-model API accuracy, latency, token usage or cost-per-success measurement was performed. The former fixture-identification path cannot establish general image recognition accuracy. Do not claim accuracy improvement or release-gate completion from the passing unit tests.
