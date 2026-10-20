# V12.28 — Server-side Post-Process Only

- Normal chapter writing remains client-side: stream -> Quality Gate -> persist chapter -> report completion.
- Removed browser-side `runCanonPostProcess()` from the normal generation path.
- After chapter persistence, the app creates a Netlify Background Job with `mode=postprocess`.
- Netlify Background Function runs summary, character/world updates, Current Status, Memory, Scene, next-chapter hint, and Canon sync.
- Job state is stored in Netlify Blobs and can continue after the iPhone is locked/left, subject to Netlify Background Function limits.
- Existing manual background-write button is converted to a manual post-process retry button; it no longer writes a chapter.
- Existing job polling/merge/security mechanisms are retained.
