const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const start = source.indexOf('async function callAI(prompt, opts){');
assert(start >= 0, 'callAI function exists');
const end = source.indexOf('\n}\n', start);
assert(end > start, 'callAI function ends');
const fnSource = source.slice(start, end + 2);

function contextWithFetch(fetchImpl) {
  const ctx = {
    state: { apiEndpoint: 'https://api.example/v1/chat/completions', apiKey: 'test-key', model: 'test-model', streamingEnabled: true },
    apiEndpointInput: { value: '' }, apiKeyInput: { value: '' }, modelSelect: { value: '' },
    SYSTEM_PROMPT: 'system', AI_CALL_TIMEOUT_MS: 5000, AI_IDLE_TIMEOUT_MS: 5000, AI_MAX_RETRIES: 2,
    AI_RETRYABLE_STATUS: new Set([408, 429, 500, 502, 503, 504]),
    location: { protocol: 'https:', hostname: 'example.com', origin: 'https://example.com' },
    fetch: fetchImpl, AbortController, TextDecoder, URL, Response, ReadableStream,
    setTimeout, clearTimeout, sleep: async () => {},
    estimateTokens: s => String(s || '').length, trackCost: () => {}, refreshStatBar: () => {},
    priceForModel: () => ({ in: 0, out: 0 }),
    _callLog: [], _callLabel: () => 'test', _chapterStartAt: 0,
    userStopRequested: false, globalAbort: null, lastPromptSent: '', lastResponseRaw: '',
    console
  };
  vm.createContext(ctx);
  vm.runInContext(fnSource + '\nthis.__callAI = callAI;', ctx);
  return ctx;
}

(async () => {
  // Provider's final SSE event has no trailing newline: it must still be consumed.
  {
    const sse = 'data: ' + JSON.stringify({ choices: [{ delta: { content: 'Xin chào', role: 'assistant' }, finish_reason: null }] });
    const ctx = contextWithFetch(async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sse)); c.close(); } }), { headers: { 'content-type': 'text/event-stream' } }));
    const result = await ctx.__callAI('prompt', { streaming: true, onChunk: () => {}, skipTracking: true });
    assert.strictEqual(result.text, 'Xin chào');
  }
  // Empty SSE response retries once without stream=true and uses final JSON content.
  {
    let calls = 0;
    const ctx = contextWithFetch(async (_url, init) => {
      calls++;
      if (calls === 1) return new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
      assert.strictEqual(init.body.includes('"stream":true'), false, 'fallback request disables streaming');
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Nội dung dự phòng' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
    });
    const result = await ctx.__callAI('prompt', { streaming: true, onChunk: () => {}, skipTracking: true });
    assert.strictEqual(result.text, 'Nội dung dự phòng');
    assert.strictEqual(calls, 2);
  }
  console.log('PASS V12.30 streaming fix: final SSE chunk without newline + empty-stream non-stream fallback');
})().catch(err => { console.error(err); process.exit(1); });
