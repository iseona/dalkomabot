# Recommendation

Scope: deterministic party and lead scoring in `dist/engine.mjs` plus its thin UI adapters. Do not add network or image recognition dependencies. Run `node tests/verify.mjs`.

## Mandatory top-meta validation (user confirmed 2026-09-14)

Every party analysis, including future AI explanations, must validate against the current mode's top 20 species in the loaded public-team frequency data. Include outgoing damage, incoming damage with the selected party investment, and speed comparisons. State the source season/date, assumed opponent sets and excluded effects. Do not label partial/missing data as completed validation. Recommendations must follow `sources/01-AI_-.md` and cite the relevant top-20 checks; repeat checks after changing a party or its sets.
