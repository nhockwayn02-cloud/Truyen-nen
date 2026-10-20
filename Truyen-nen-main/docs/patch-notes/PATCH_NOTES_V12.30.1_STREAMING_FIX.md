# V12.30.1 — Fix empty streaming response

## Root causes addressed
- SSE parser only accepted `data: ` and could drop a final event if no trailing newline.
- Response parsing assumed every `stream=true` response had SSE content type.
- An empty stream failed immediately instead of trying a non-streaming request.

## Changes
- Accept `data:` with or without a space, CRLF, heartbeat lines, and final unterminated event.
- Check response content type; JSON responses are parsed as normal final responses.
- When SSE ends with no content, retry with `stream` disabled, using the same configured model and prompt. The normal retry limit applies. No empty content is accepted as a successful result.
- No model routing, chapter prompt, postprocessing, Character Database, or Memory merge changes.

## Tests
- New test simulates final SSE event without newline.
- New test simulates empty SSE then a valid non-streaming JSON response.
- Full `npm test` suite run before packaging. Browser E2E tests are skipped if Playwright/Chromium are unavailable.
