# V12.31.2 — Output token cap compatibility fix

- Capped every foreground `callAI` request to max 7,800 output tokens, regardless of a larger task-specific requested limit.
- Capped background worker OpenAI-compatible streaming requests to 7,800 output tokens.
- Capped background retry-doubling logic to 7,800 so retries cannot exceed the same model/provider limit.
- Kept chapter target length and auto-continue logic unchanged; this is a per-request output cap, not a total chapter word cap.
- Added `tests/v12.31.2-output-token-cap.test.js`.

Validation:
- Focused output-token cap test: PASS.
- `npm test`: all runnable tests PASS; four browser E2E suites SKIP because Playwright is unavailable in the environment.
- Not live-tested against the user's AnonRouter key/model.
