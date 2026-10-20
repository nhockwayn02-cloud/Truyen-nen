# V12.28.1 — Fix getEndingTarget

## Bug
Runtime error: `Can't find variable: getEndingTarget`.

## Cause
V12.28's client code referenced `getEndingTarget()` from the V12.24 Ending Anchor flow, but the helper was missing after merging the Fast Write + Server Post-Process architecture.

## Fix
Restored the helper:
- Prefer Ending Anchor extracted from the chapter hint.
- Fall back to the directive.
- Reuses existing `extractEndingAnchor()` logic.

## Verification
- JavaScript syntax: PASS
- Shared client/worker sync: PASS
- Quality Gate: 33/33
- Characters: 11/11
- Worker: 37/37
- V12.20: 16/16
- V12.22b: 8/8
- V12.23: 9/9
- Background create-job: 5/5
- Routing: 7/7
- Security: 12/12
- Worker integration: PASS
- Gate-fail integration: PASS
- E2E: skipped because Playwright/Python is unavailable in the test environment.
