// Test bảo mật server — chạy: node tests/security.test.js  (không cần mạng)
const Module = require("module"), path = require("path"), assert = require("assert");
const db = new Map();
const store = { async get(k) { const v = db.get(k); return v ? JSON.parse(v) : null; }, async setJSON(k, v) { db.set(k, JSON.stringify(v)); }, async delete(k) { db.delete(k); }, async list() { return { blobs: [...db.keys()].map(key => ({ key })) }; } };
const mockBlobs = { connectLambda() {}, getStore() { return store; } };
const origLoad = Module._load;
Module._load = function (req, ...a) { return req === "@netlify/blobs" ? mockBlobs : origLoad.call(this, req, ...a); };
let triggers = 0;
global.fetch = async () => { triggers++; return { ok: true, status: 202, text: async () => "" }; };
process.env.URL = "https://site.example";

const sec = require("../lib/security");
const create = require("../netlify/functions/create-job").handler;
const status = require("../netlify/functions/job-status").handler;
const ENV_KEYS = ["APP_PASSCODE", "JOB_SECRET", "ALLOWED_API_HOSTS", "ALLOWED_ORIGIN", "JOB_TTL_HOURS", "ALLOW_INSECURE_ENDPOINT", "NETLIFY_API_TOKEN", "NETLIFY_JOB_SECRET"];
const reset = () => { ENV_KEYS.forEach(k => delete process.env[k]); db.clear(); triggers = 0; };
const post = (body, headers = {}) => create({ httpMethod: "POST", headers, body: JSON.stringify(Object.assign({ storyState: { chapters: [], storyId: "s1" }, apiKey: "sk-test", apiEndpoint: "https://openrouter.ai/api/v1/chat/completions" }, body)) });

const tests = [];
const T = (n, f) => tests.push([n, f]);

T("validateEndpoint: chấp nhận https công khai", () => {
  assert.strictEqual(sec.validateEndpoint("https://openrouter.ai/api/v1/chat/completions", {}).ok, true);
});
T("validateEndpoint: chặn http, localhost, IP nội bộ, metadata cloud, user:pass", () => {
  ["http://openrouter.ai/x", "https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://192.168.1.1/x", "https://172.16.0.1/x", "https://169.254.169.254/latest/meta-data", "https://[::1]/x", "https://2130706433/x", "https://x.internal/x", "https://user:pw@openrouter.ai/x", "not a url", ""]
    .forEach(u => assert.strictEqual(sec.validateEndpoint(u, {}).ok, false, u));
});
T("validateEndpoint: ALLOWED_API_HOSTS giới hạn theo tên miền (kể cả subdomain)", () => {
  const env = { ALLOWED_API_HOSTS: "openrouter.ai, api.deepseek.com" };
  assert.strictEqual(sec.validateEndpoint("https://openrouter.ai/v1", env).ok, true);
  assert.strictEqual(sec.validateEndpoint("https://eu.openrouter.ai/v1", env).ok, true);
  assert.strictEqual(sec.validateEndpoint("https://evilopenrouter.ai/v1", env).ok, false);
  assert.strictEqual(sec.validateEndpoint("https://example.com/v1", env).ok, false);
});
T("jobAgeMs / purgeOldJobs chỉ xoá job quá hạn", async () => {
  reset();
  const now = Date.now(), mk = ms => "job_" + (now - ms).toString(36) + "_abcdef";
  const oldId = mk(50 * 3600e3), newId = mk(1 * 3600e3);
  await store.setJSON(oldId, {}); await store.setJSON(newId, {}); await store.setJSON("khac", {});
  const n = await sec.purgeOldJobs(store, { ttlMs: 48 * 3600e3, now });
  assert.strictEqual(n, 1); assert(!db.has(oldId)); assert(db.has(newId)); assert(db.has("khac"), "key lạ không được xoá");
});
T("create-job: không có APP_PASSCODE -> hoạt động như cũ + trả cảnh báo", async () => {
  reset();
  const r = await post({}); const b = JSON.parse(r.body);
  assert.strictEqual(r.statusCode, 200, r.body); assert(b.jobId && b.accessToken);
  assert(b.warnings.some(w => /JOB_SECRET/.test(w)) && b.warnings.some(w => /APP_PASSCODE/.test(w)));
  assert.strictEqual(triggers, 1);
});
T("create-job: có APP_PASSCODE -> sai/thiếu = 401 và KHÔNG tạo job", async () => {
  reset(); process.env.APP_PASSCODE = "bi-mat";
  let r = await post({}); assert.strictEqual(r.statusCode, 401);
  r = await post({}, { "x-app-passcode": "sai" }); assert.strictEqual(r.statusCode, 401);
  assert.strictEqual(db.size, 0); assert.strictEqual(triggers, 0);
  r = await post({}, { "x-app-passcode": "bi-mat" }); assert.strictEqual(r.statusCode, 200, r.body);
  r = await post({ passcode: "bi-mat" }); assert.strictEqual(r.statusCode, 200);
});
T("create-job: endpoint nội bộ bị từ chối 400, không lưu job", async () => {
  reset();
  const r = await post({ apiEndpoint: "https://169.254.169.254/latest" });
  assert.strictEqual(r.statusCode, 400); assert.strictEqual(db.size, 0); assert.strictEqual(triggers, 0);
});
T("create-job: có JOB_SECRET -> mã hóa key, không còn cảnh báo JOB_SECRET; key không lộ dạng rõ", async () => {
  reset(); process.env.JOB_SECRET = "x".repeat(32); process.env.APP_PASSCODE = "p";
  const r = await post({ passcode: "p" }); const b = JSON.parse(r.body);
  assert.strictEqual(r.statusCode, 200); assert.deepStrictEqual(b.warnings, []);
  const raw = db.get(b.jobId); assert(!raw.includes("sk-test"), "API key bị lưu dạng rõ");
});
T("create-job: tự dọn job quá hạn khi tạo job mới", async () => {
  reset();
  const oldId = "job_" + (Date.now() - 100 * 3600e3).toString(36) + "_aa"; await store.setJSON(oldId, { status: "completed" });
  const r = await post({}); assert.strictEqual(r.statusCode, 200); assert(!db.has(oldId));
});
T("create-job: ALLOWED_ORIGIN được áp dụng cho CORS", async () => {
  reset(); process.env.ALLOWED_ORIGIN = "https://truyen.example";
  const r = await post({}); assert.strictEqual(r.headers["Access-Control-Allow-Origin"], "https://truyen.example");
});
T("job-status: ack xoá job đã xong, từ chối job đang chạy, cần đúng token", async () => {
  reset();
  const b = JSON.parse((await post({})).body);
  const q = (extra = {}) => status({ httpMethod: "GET", headers: {}, queryStringParameters: Object.assign({ jobId: b.jobId, token: b.accessToken }, extra) });
  assert.strictEqual((await q({ ack: "1" })).statusCode, 409, "job pending không được xoá"); assert(db.has(b.jobId));
  assert.strictEqual((await q({ ack: "1", token: "sai" })).statusCode, 403); assert(db.has(b.jobId));
  const job = JSON.parse(db.get(b.jobId)); job.status = "completed"; db.set(b.jobId, JSON.stringify(job));
  const r = await q({ ack: "1" }); assert.strictEqual(r.statusCode, 200); assert(!db.has(b.jobId));
});
T("job-status: không bao giờ trả API key", async () => {
  reset();
  const b = JSON.parse((await post({})).body);
  const r = await status({ httpMethod: "GET", headers: {}, queryStringParameters: { jobId: b.jobId, token: b.accessToken } });
  assert(!r.body.includes("sk-test") && !/apiKey/i.test(r.body));
});

(async () => {
  let fail = 0;
  for (const [n, f] of tests) { try { await f(); console.log("PASS " + n); } catch (e) { fail++; console.log("FAIL " + n + " — " + (e.stack || e.message).split("\n").slice(0, 3).join(" | ")); } }
  console.log(`\n${tests.length - fail}/${tests.length} PASS`); process.exit(fail ? 1 : 0);
})();
