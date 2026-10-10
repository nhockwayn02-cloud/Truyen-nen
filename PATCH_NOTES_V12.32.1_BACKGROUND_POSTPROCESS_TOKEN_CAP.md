# V12.32.1 — Fix background post-process not updating

- Root cause found: the unified background post-process (`runUnifiedPostProcess`) still requested `maxTokens: 16000`, despite V12.31.2's cap on other API call paths. Models advertising an 8192-token output maximum can reject the call before returning JSON; the fail-safe then preserves old data, making background post-processing appear not to update.
- Fix: cap the unified post-process call at 7800 output tokens, below 8192.
- This addresses the known request-limit rejection. It does not guarantee every task updates if the model truncates the large JSON response; check per-task status/problems when diagnosing other failures.
