// V14.7.1: kiểm thử callAI bằng fetch giả (không gọi API thật): lỗi HTTP, Retry-After, JSON hỏng, phản hồi rỗng, rò rỉ API key.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '../app/client.js'), 'utf8');
const a = src.indexOf('async function callAI(prompt, opts){'), b = src.indexOf('function stopGeneration(){');
assert.ok(a > 0 && b > a, 'không tìm thấy callAI');
const fnSrc = src.slice(a, b);
const KEY = 'sk-test-SECRET-1234567890abcdef';
function makeEnv(responses) {
  const calls = []; let i = 0;
  const env = {
    state: { apiEndpoint: 'https://api.example.com/v1/chat/completions', apiKey: KEY, model: 'm1', streamingEnabled: false },
    apiEndpointInput: { value: '' }, apiKeyInput: { value: '' }, modelSelect: { value: '' },
    classifyStep: () => 'write', modelForStep: () => '', SYSTEM_PROMPT: 'sys', AI_MAX_OUTPUT_TOKENS: 7800,
    AI_CALL_TIMEOUT_MS: 60000, AI_IDLE_TIMEOUT_MS: 60000, AI_MAX_RETRIES: 4, AI_BACKOFF_5XX_MS: [1, 1, 1, 1],
    AI_RETRYABLE_STATUS: new Set([408, 425, 429, 500, 502, 503, 504, 524]),
    globalAbort: null, userStopRequested: false, lastPromptSent: '', lastResponseRaw: '', _callLog: [], _callLabel: () => 'x',
    estimateTokens: s => String(s).length / 4, trackCost: () => {}, sleep: () => Promise.resolve(),
    location: { protocol: 'https:', origin: 'https://app.example', hostname: 'app.example' },
    AbortController, setTimeout, clearTimeout, console, JSON, Promise, Error, Math, Number, String, Set, TextDecoder, Date,
    fetch: async (url, init) => { calls.push({ url, init }); const r = responses[Math.min(i++, responses.length - 1)]; if (r instanceof Error) throw r; return r; }
  };
  env.calls = calls; return env;
}
const resp = (status, body, headers) => ({ ok: status >= 200 && status < 300, status, statusText: 'ST', headers: { get: k => (headers || {})[String(k).toLowerCase()] || null }, json: async () => { if (typeof body === 'string') throw new SyntaxError('Unexpected token < in JSON'); return body; } });
const okBody = (text, fr) => ({ choices: [{ message: { content: text }, finish_reason: fr || 'stop' }] });
async function run(responses) { const env = makeEnv(responses); vm.createContext(env); vm.runInContext(fnSrc + '\n;globalThis.__f = callAI;', env); let out, err; try { out = await env.__f('viết', {}); } catch (e) { err = e; } return { out, err, calls: env.calls }; }
let bad = 0;
async function test(name, fn) { try { await fn(); console.log('PASS ' + name); } catch (e) { bad++; console.error('FAIL ' + name + ': ' + e.message); } }
(async () => {
  await test('200 hợp lệ trả text + finishReason, gửi Bearer đúng', async () => {
    const r = await run([resp(200, okBody('  Xin chào  ', 'length'))]);
    assert.equal(r.out.text, 'Xin chào'); assert.equal(r.out.finishReason, 'length'); assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0].init.headers.Authorization, 'Bearer ' + KEY);
  });
  await test('401/403/404 KHÔNG retry', async () => {
    for (const st of [401, 403, 404]) { const r = await run([resp(st, { error: { message: 'bad' } })]); assert.ok(r.err && r.err.status === st); assert.equal(r.calls.length, 1, 'HTTP ' + st + ' bị retry'); }
  });
  await test('429 có Retry-After rồi thành công (retry giới hạn)', async () => {
    const r = await run([resp(429, { error: { message: 'slow' } }, { 'retry-after': '1' }), resp(200, okBody('ổn'))]);
    assert.equal(r.out.text, 'ổn'); assert.equal(r.calls.length, 2);
  });
  await test('503 liên tục: dừng sau MAX_RETRIES+1 lần và báo rõ HTTP 503', async () => {
    const r = await run([resp(503, { error: { message: 'down' } })]);
    assert.equal(r.calls.length, 5); assert.match(r.err.message, /HTTP 503/);
  });
  await test('lỗi mạng: retry có giới hạn rồi báo lỗi, không lộ key', async () => {
    const r = await run([new TypeError('Failed to fetch ' + KEY)]);
    assert.equal(r.calls.length, 5); assert.ok(r.err); assert.ok(!r.err.message.includes(KEY), 'lộ API key trong thông báo lỗi mạng');
  });
  await test('thông báo lỗi 401 của nhà cung cấp có lặp lại API key → phải che', async () => {
    const r = await run([resp(401, { error: { message: 'Incorrect API key provided: ' + KEY + '. Check your key.' } })]);
    assert.ok(r.err); assert.ok(!r.err.message.includes(KEY), 'lộ API key: ' + r.err.message);
  });
  await test('200 nhưng body không phải JSON (trang HTML của proxy) → thông báo tiếng Việt rõ ràng', async () => {
    const r = await run([resp(200, '<html>gateway</html>')]);
    assert.ok(r.err); assert.ok(!/Unexpected token/.test(r.err.message), 'lộ lỗi thô: ' + r.err.message); assert.match(r.err.message, /JSON|phản hồi/i);
  });
  await test('phản hồi rỗng / không có choices → lỗi, không trả nội dung rỗng', async () => {
    let r = await run([resp(200, okBody('   '))]); assert.ok(r.err && !r.out);
    r = await run([resp(200, { choices: [] })]); assert.ok(r.err && !r.out);
  });
  await test('thiếu API key → lỗi rõ ràng, không gọi mạng', async () => {
    const env = makeEnv([resp(200, okBody('x'))]); env.state.apiKey = ''; vm.createContext(env); vm.runInContext(fnSrc + '\n;globalThis.__f = callAI;', env);
    await assert.rejects(() => env.__f('p', {}), /API key/); assert.equal(env.calls.length, 0);
  });
  console.log(bad ? 'FAIL ' + bad : 'PASS callAI API'); process.exit(bad ? 1 : 0);
})();
