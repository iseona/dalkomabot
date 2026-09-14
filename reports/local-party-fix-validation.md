# Local party recognition fix

2026-09-14. Supersedes the failed API experiment status for these party samples.

| Actual page input | Correct fields | Inference calls |
| --- | ---: | ---: |
| Original party ability + stats | 84/84 | 0 |
| User cross-party ability + stats | 84/84 | 0 |
| Original party, 1280x720 JPEG 85% | 84/84 | 0 |
| Cross-party, 1280x720 JPEG 85% | 84/84 | 0 |

Fields: six species, six items, six abilities, six natures, 24 ordered moves, 36 EVs. Inference endpoint is intercepted and aborted: no saved AI response supplies these answers. Ground truth is loaded by the test only after page recognition; production code never imports fixture answers.

The primary agent personally read all 12 original-resolution slot screenshots and compared their displayed values with the sources. Cross-party 똬리틀기, 한카리아스 and 브리두라스 are correct; original 라이츄나이트Y is distinguished by the printed suffix glyph, not guessed from a tied dictionary match.

Mechanism: locally hosted OCR, full-dictionary Hangul spelling comparison, red/blue nature arrows, six exact stat equations against master species data. Low-resolution alternate OCR readings are accepted only when a unique species and EV vector satisfy all six equations using observed numbers. Missing values are not filled with zero or popular builds.

Negative test: first move and HP text erased from the added pair; missing move and species stay empty, HP stays null. No hidden fixture answer is restored.

Lead regression: two existing reference screens, 24/24 names/forms and zero inference calls. This validates known reference behavior only. The generic unseen template ranker's earlier 34/55 top-1 result is not replaced by this known-reference score.

Scope: no production model upgrade, no party-analysis change.

## Published verification

Deployed to https://dimrme6yznu6a.cloudfront.net. Static recognition files only; Lambda, model, environment, runtime configuration and source data were not changed. Initial release omitted `ocr-draft.mjs`, causing module loading to fail; that required dependency was added and startup rechecked before final validation. The deploy helper now verifies the imported module graph before any future writes.

Published actual-page checks: both party pairs 84/84, all POST requests blocked, zero inference calls. The primary agent also uploaded the user's original two files through the live Edge browser, read every displayed field, and confirmed the live `로컬 인식 완료 · 6/6마리 확인 · AI 호출 없음` status. Published lead checks: 24/24 known-reference names/forms, zero inference calls.

Recovery backups: `/home/cloudshell-user/recognition-release-backup-cn119486` and `/home/cloudshell-user/recognition-release-backup-0hrl271l`. Invalidations: `ID9V7R3P664CBVJLZM2W5QLUNV` and `IEGTQAVAWDK6L28FPHSOGTEF9`. No Git commit or push was performed.
