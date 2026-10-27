// V14.3.4: create-job nhận body gzip, ghi Blobs có timeout, log "received".
const assert = require('assert'), zlib = require('zlib'), Module = require('module'), path = require('path');
let saved = null, hang = false, logs = [];
const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === '@netlify/blobs') return { connectLambda() {}, getStore: () => ({ setJSON: async (k, v) => { if (hang) return new Promise(() => {}); saved = { k, v }; }, list: async () => ({ blobs: [] }), get: async () => null, delete: async () => {} }) };
  return origLoad.apply(this, arguments);
};
process.env.URL = 'https://example.netlify.app'; process.env.JOB_SECRET = 'x';
global.fetch = async () => ({ ok: true, status: 202, text: async () => '' });
const origLog = console.log; console.log = (...a) => { logs.push(a.join(' ')); };
const mod = require(path.join(__dirname, '../netlify/functions/create-job.js'));
const body = JSON.stringify({ storyState: { storyId: 's1', chapters: [{ text: 'Chương một. '.repeat(500) }] }, apiKey: 'sk-test', apiEndpoint: 'https://openrouter.ai/api/v1/chat/completions', mode: 'write', draftOnly: true });
const mk = (extra) => Object.assign({ httpMethod: 'POST', headers: { host: 'example.netlify.app' } }, extra);
let pass = 0; const t = async (n, f) => { await f(); origLog('PASS ' + n); pass++; };
(async () => {
  await t('decodeBody: gzip base64 -> JSON gốc', async () => {
    const gz = zlib.gzipSync(Buffer.from(body, 'utf8'));
    assert.strictEqual(mod._decodeBody(mk({ headers: { 'x-body-encoding': 'gzip' }, body: gz.toString('base64'), isBase64Encoded: true })), body);
    assert.strictEqual(mod._decodeBody(mk({ body })), body, 'không nén -> giữ nguyên');
  });
  await t('handler: body gzip tạo job thành công, có log received', async () => {
    const gz = zlib.gzipSync(Buffer.from(body, 'utf8'));
    const r = await mod.handler(mk({ headers: { host: 'example.netlify.app', 'x-body-encoding': 'gzip' }, body: gz.toString('base64'), isBase64Encoded: true }));
    assert.strictEqual(r.statusCode, 200, r.body);
    assert.ok(saved && saved.v.storyState.storyId === 's1');
    assert.ok(logs.some(l => /\[create-job\] received/.test(l)));
  });
  await t('handler: JSON thường vẫn chạy như cũ', async () => {
    saved = null; const r = await mod.handler(mk({ body }));
    assert.strictEqual(r.statusCode, 200, r.body); assert.ok(saved);
  });
  await t('handler: Blobs treo -> trả 504 rõ ràng, không treo vô hạn', async () => {
    hang = true; const t0 = Date.now(); const r = await mod.handler(mk({ body })); hang = false;
    assert.strictEqual(r.statusCode, 504, r.body); assert.ok(/Netlify Blobs/.test(JSON.parse(r.body).error)); assert.ok(Date.now() - t0 < 9000);
  });
  origLog('OK ' + pass + ' test'); process.exit(0);
})().catch(e => { origLog(e); process.exit(1); });
