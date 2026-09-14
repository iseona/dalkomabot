# Screenshot recognition acceptance fixtures

These images are the release gate for screenshot recognition. A schema-only test is not enough.

- `lead-eternal-flower.jpg`: all 12 species/forms must match in slot order.
- `party-stats.jpg`: all 6 species/forms and all 36 EV values must match.
- `party-ability.jpg`: all 6 species/forms plus visible items, abilities, and moves must match.
- `lead-alolan-ninetales.webp`: all 12 species/forms must match. The fifth left slot must resolve to `알로라 나인테일`; the visible short label `나인테일` must not collapse the form.

Recognition must fail visibly per slot when confidence is insufficient. It must not substitute a guessed species or form.
