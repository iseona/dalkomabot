# Dalkombot task map

Read only the task guide and files for the feature being changed. Expand scope only when an interface requires it.

| Task | Guide | Primary files |
|---|---|---|
| AI screenshot recognition | `tasks/recognition/README.md` | `dist/ai-recognition.mjs`, `aws/recognizer.py`, recognition UI in `dist/app.js` |
| Party and lead recommendation | `tasks/recommendation/README.md` | `dist/engine.mjs`, recommendation/lead sections in `dist/app.js` |
| Calculator and shared UI | `tasks/calculator/README.md` | `dist/calculator.mjs`, `dist/ui.mjs`, `dist/ui-templates.mjs` |
| AWS and source data | `tasks/aws-data/README.md` | `aws/`, `scripts/import_opendata.py`, `dist/opendata.json` |
| Discord | `tasks/discord/README.md` | `discord/`, shared `dist/engine.mjs` contracts |

Run the smallest feature test first, then `node tests/verify.mjs`. Never put API keys in browser code, static assets, logs, or Git. Do not merge to `main`, deploy AWS, commit, or push unless the user explicitly requests it.
