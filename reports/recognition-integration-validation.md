# Recognition integration cleanup — 2026-09-14

Repository: `C:\Users\user\Downloads\champs\dalkombot`.

The adaptive local recognizer was already committed as `c6b3f2c` before this cleanup. Current cleanup preserves that implementation and removes unsuccessful AI experiments from the integration diff. The previous prompt/schema/model settings are unchanged from HEAD; the 1600-token, no-reasoning fallback contract is retained. Experimental source remains locally under `.local-icon-training/recognizer-experiment-before-integration.py`, excluded from the commit and deployment.

Remaining backend changes are deterministic: normalize whitespace against the official dictionary only when unique, and keep unread move slots empty without shifting later moves. Tests explicitly reject unknown text and missing X/Y suffixes. Added actual-page timeout status output for future diagnostics.

Validation rerun for this cleanup:

- Original, cross and ultrawide real source pairs: actual browser page 84/84 each, zero POST requests.
- Adaptive geometry: 96 transforms passed; six missing-card images rejected.
- `tests/recognition.mjs`, `tests/recognizer_request_test.py`, `tests/recognition-cost-routing.mjs`, `tests/recognition-merge.mjs`, `tests/ocr-draft.mjs`, `tests/local-text-validation.mjs`, `tests/recognition-reference-labels.mjs`: passed.
- `node tests/verify.mjs`: passed after restoring the contract, without weakening its recognizer assertion.
- Changed JavaScript syntax checks: passed.
- Exported the selected Git index into a separate check directory under this repository and reran full verify, JS response tests, Python request tests and changed-JS syntax checks: all passed without the unrelated uncommitted Discord edits.

Integration scope: local party recognition and deterministic fallback-result sanitation. No new real AI inference request was made; optional AI recognition accuracy, unseen lead-screen accuracy and completely different UI layouts are not certified. Existing known-reference lead validation is described separately in the adaptive report.

Discord changes, including the unrelated Discord lines of `tests/verify.mjs`, are intentionally excluded. No push, main merge or AWS deployment is performed in this cleanup.
