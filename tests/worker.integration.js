// Test tích hợp worker: chạy toàn bộ handler với Blobs + API giả (có độ trễ).
// Chạy: EXTRACT_CONCURRENCY=1 node tests/worker.integration.js   (tuần tự)   |   EXTRACT_CONCURRENCY=3 node ... (song song)
const Module = require("module"), crypto = require("crypto"), path = require("path"), assert = require("assert");
const LAT = 300; // ms mỗi lệnh gọi giả lập
const db = new Map();
const mockBlobs = { connectLambda() {}, getStore() { return { async get(k) { const v = db.get(k); return v ? JSON.parse(v) : null; }, async setJSON(k, v) { db.set(k, JSON.stringify(v)); } }; } };
const origLoad = Module._load;
Module._load = function (req, ...a) { return req === "@netlify/blobs" ? mockBlobs : origLoad.call(this, req, ...a); };

const counts = { nv: 0, world: 0, other: 0, chapter: 0 };
let inflight = 0, maxInflightNV = 0, inflightNV = 0;
const LONG = ("Gió thổi qua con phố vắng, cô bước đi giữa đêm mưa lạnh. ".repeat(1100)).trim(); // ~60k ký tự
global.fetch = async (url, init) => {
  const body = JSON.parse(init.body); const prompt = JSON.stringify(body.messages);
  const isNV = prompt.includes("CẬP NHẬT NHÂN VẬT"), isW = prompt.includes("CẬP NHẬT THẾ GIỚI");
  const isChapter = /VIẾT CHƯƠNG|Viết TIẾP chương|Bạn đang viết CHƯƠNG THỨ/.test(prompt);
  const isSummary = prompt.includes("bộ máy tóm tắt");
  const isReview = prompt.includes("QUALITY AUDITOR");
  if (isNV) { counts.nv++; inflightNV++; maxInflightNV = Math.max(maxInflightNV, inflightNV); } else if (isW) counts.world++; else if (isChapter) counts.chapter++; else if (isReview) counts.other++; else counts.other++;
  await new Promise(r => setTimeout(r, LAT));
  if (isNV) inflightNV--;
  let content;
  if (isChapter) content = LONG;
  else if (isReview) content = JSON.stringify({score:96,verdict:"PASS",dimensions:{continuity:20,characterConsistency:15,canonConsistency:15,plotDiscipline:15,worldRules:10,outlineCompliance:10,style:5,pacing:5,knowledgeConsistency:5},mainEventCount:1,namedCharacterCount:1,unauthorizedImportantCharacter:false,knowledgeViolation:false,retcon:false,outlineDeviation:false,hardFailures:[],warnings:[],suggestions:[],rewriteInstructions:[]});
  else if (isSummary) content = "**Tóm tắt chương:** Cô bước đi giữa đêm mưa lạnh trên con phố vắng, gió thổi qua.";
  else if (isNV) content = '[{"name":"Lan","tier":"major","role":"chính"},{"name":"Minh","tier":"major","role":"phụ"}]';
  else if (isW) content = '{"locations":[{"name":"Phố cũ","description":"vắng","status":"active"}],"items":[],"threads":[]}';
    else content = '{"summary":"x","timeline":[],"foreshadowing":[],"knowledgeLedger":[],"status":"ổn"}';
  return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ choices: [{ message: { content }, finish_reason: "stop" }] }), text: async () => content };
};
const worker = require(path.join(__dirname, "../netlify/functions/write-chapter-background.js"));
(async () => {
  const token = "tok"; const jobId = "job1";
  db.set(jobId, JSON.stringify({ jobId, createdAt: Date.now(), status: "queued", schemaVersion: 9, workerTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    apiKeyEncrypted: { encrypted: false, value: "k" }, apiEndpoint: "http://mock/chat/completions", model: "m", modelNsfw: "",
    storyState: { chapters: [], characters: [], locations: [], items: [], threads: [], minChapterWords: 500, mature: false, nsfwMode: "never", mainCharProfile: { name: "Lan" } } }));
  const t0 = Date.now();
  const res = await worker.handler({ httpMethod: "POST", body: JSON.stringify({ jobId, workerToken: token }), headers: {} });
  const secs = (Date.now() - t0) / 1000;
  const job = JSON.parse(db.get(jobId));
  assert.strictEqual(res.statusCode, 200, "handler trả " + res.statusCode + " " + res.body);
  assert.strictEqual(job.status, "completed", "job status = " + job.status + " / " + job.error);
  const chars = job.storyState.characters.map(c => c.name);
  assert(chars.includes("Minh"), "NV Minh phải được merge (kể cả khi nhiều lô trả cùng tên): " + JSON.stringify(chars));
  assert.strictEqual(chars.filter(n => n === "Minh").length, 1, "không được tạo trùng NV khi chạy lô song song");
  /* v12.18: "Lan" là Nhân Vật Chính (mainCharProfile) → không được nhân bản thành mục trong Character Database */
  assert(!chars.includes("Lan"), "Nhân vật chính không được bị tạo thành mục trùng trong DB: " + JSON.stringify(chars));
  assert(job.storyState.locations.some(l => l.name === "Phố cũ") && job.storyState.locations.filter(l => l.name === "Phố cũ").length === 1, "địa điểm phải có đúng 1 bản");
  assert(/Tóm tắt chương/.test(job.resultChapter.summary || ""), "summary phải được gán: " + job.resultChapter.summary);
  assert(job.resultChapter.control && job.resultChapter.control.focus === "none", "chapter.control phải được lưu (regression V12.13): " + JSON.stringify(job.resultChapter.control));
  assert(!/^TIÊU ĐỀ|^NỘI DUNG/i.test(job.resultChapter.text), "văn bản không được dính nhãn");
  // V12.17: Gate PASS → Sync qua hàm dùng chung (applyCanonSync)
  const rc = job.resultChapter;
  const hasWarn = !!(rc.autoUpdateIssues && rc.autoUpdateIssues.length); // dữ liệu giả không trả JSON Status hợp lệ → có cảnh báo (giống v12.16b)
  assert.strictEqual(rc.status, hasWarn ? "SYNCED_WITH_WARNINGS" : "SYNCED", "trạng thái Sync phải khớp cảnh báo, đang là " + rc.status);
  assert.strictEqual(rc.canonVersion, 1, "canonVersion chương = 1"); assert.strictEqual(job.storyState.canonVersion, 1, "canonVersion truyện = 1");
  assert(rc.sync && rc.sync.status === rc.status && rc.sync.canonVersion === 1 && rc.sync.syncedAt, "chapter.sync phải đầy đủ: " + JSON.stringify(rc.sync));
  assert(rc.review && rc.review.verdict === "PASS" && rc.review.status === "completed", "review PASS phải được lưu: " + JSON.stringify(rc.review));
  assert(!job.qualityGateFailed, "không được đặt qualityGateFailed khi PASS");
  console.log(JSON.stringify({ concurrency: process.env.EXTRACT_CONCURRENCY || "3 (mặc định)", seconds: +secs.toFixed(1), nvBatches: counts.nv, maxParallelNV: maxInflightNV, status: job.status }));
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
