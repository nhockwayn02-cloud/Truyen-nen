// Tích hợp worker — trường hợp TRƯỢT Quality Gate: bản nháp được giữ, KHÔNG chạy cập nhật Canon/Memory, KHÔNG Sync.
// Chạy: node tests/worker.gatefail.js
const Module = require("module"), crypto = require("crypto"), path = require("path"), assert = require("assert");
const db = new Map();
const mockBlobs = { connectLambda() {}, getStore() { return { async get(k) { const v = db.get(k); return v ? JSON.parse(v) : null; }, async setJSON(k, v) { db.set(k, JSON.stringify(v)); } }; } };
const origLoad = Module._load;
Module._load = function (req, ...a) { return req === "@netlify/blobs" ? mockBlobs : origLoad.call(this, req, ...a); };
const c = { review: 0, rewrite: 0, nv: 0, world: 0, summary: 0, other: 0 };
const LONG = ("Gió thổi qua con phố vắng, cô bước đi giữa đêm mưa lạnh. ".repeat(1100)).trim();
global.fetch = async (url, init) => {
  const prompt = JSON.stringify(JSON.parse(init.body).messages);
  let content;
  if (/VIẾT CHƯƠNG|Viết TIẾP chương|Bạn đang viết CHƯƠNG THỨ/.test(prompt)) content = LONG;
  else if (prompt.includes("QUALITY AUDITOR")) { c.review++; content = JSON.stringify({ score: 50, verdict: "HARD_FAIL", mainEventCount: 6, namedCharacterCount: 2, hardFailures: ["Sai outline"], rewriteInstructions: ["Bỏ bớt sự kiện"] }); }
  else if (prompt.includes("SỬA LẠI BẢN THẢO")) { c.rewrite++; content = LONG; }
  else if (prompt.includes("CẬP NHẬT NHÂN VẬT")) { c.nv++; content = "[]"; }
  else if (prompt.includes("CẬP NHẬT THẾ GIỚI")) { c.world++; content = "{}"; }
  else if (prompt.includes("bộ máy tóm tắt")) { c.summary++; content = "**Tóm tắt chương:** x"; }
  else if (/Lập KẾ HOẠCH cho CHƯƠNG/.test(prompt)) { content = "Kế hoạch ngắn."; }
  else { c.other++; content = "{}"; }
  return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ choices: [{ message: { content }, finish_reason: "stop" }] }), text: async () => content };
};
const worker = require(path.join(__dirname, "../netlify/functions/write-chapter-background.js"));
(async () => {
  const token = "tok", jobId = "jobfail";
  db.set(jobId, JSON.stringify({ jobId, createdAt: Date.now(), status: "queued", schemaVersion: 9, workerTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    apiKeyEncrypted: { encrypted: false, value: "k" }, apiEndpoint: "http://mock/chat/completions", model: "m", modelNsfw: "",
    storyState: { chapters: [], characters: [], locations: [], items: [], threads: [], minChapterWords: 500, mature: false, nsfwMode: "never", mainCharProfile: { name: "Lan" }, canonVersion: 4 } }));
  const res = await worker.handler({ httpMethod: "POST", body: JSON.stringify({ jobId, workerToken: token }), headers: {} });
  const job = JSON.parse(db.get(jobId)); const rc = job.resultChapter;
  assert.strictEqual(res.statusCode, 200); assert.strictEqual(JSON.parse(res.body).qualityGateFailed, true, "phản hồi handler phải có qualityGateFailed");
  assert.strictEqual(job.status, "completed"); assert.strictEqual(job.qualityGateFailed, true);
  assert.strictEqual(c.review, 3, "chấm đúng 3 lần, thực tế " + c.review); assert.strictEqual(c.rewrite, 2, "sửa đúng 2 lần, thực tế " + c.rewrite);
  assert.strictEqual(rc.status, "REVISION_REQUIRED"); assert.strictEqual(rc.review.verdict, "HARD_FAIL"); assert.strictEqual(rc.review.attempt, 3);
  assert(rc.review.hardFailures.some(h => /ngân sách sự kiện/.test(h)), "phải có hard failure vượt ngân sách: " + JSON.stringify(rc.review.hardFailures));
  assert(Array.isArray(rc.versions) && rc.versions.length >= 1, "bản gốc phải được lưu vào versions");
  assert.strictEqual(c.nv + c.world + c.summary + c.other, 0, "KHÔNG được chạy cập nhật NV/Thế giới/Tóm tắt/Memory khi chưa PASS: " + JSON.stringify(c));
  assert(!rc.canonVersion && !(rc.sync && rc.sync.syncedAt), "chưa Sync: " + JSON.stringify(rc.sync));
  assert.strictEqual(job.storyState.canonVersion, 4, "canonVersion truyện không được tăng");
  assert.strictEqual(job.storyState.chapters.length, 1); assert.strictEqual(job.storyState.chapters[0].status, "REVISION_REQUIRED");
  assert(!job.apiKey && !job.apiKeyEncrypted, "API key phải được xoá sau khi xong");
  console.log("PASS worker trượt Gate: giữ bản nháp, không cập nhật Canon, không Sync, không lộ API key\n\n1/1 PASS");
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
