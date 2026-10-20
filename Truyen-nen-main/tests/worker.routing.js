// Test định tuyến 18+: model nào được dùng, prompt có rào chắn tuổi / Story Control / focus hay không.
// Chạy: node tests/worker.routing.js
const Module = require("module"), crypto = require("crypto"), path = require("path"), assert = require("assert");
const db = new Map();
const mockBlobs = { connectLambda() {}, getStore() { return { async get(k) { const v = db.get(k); return v ? JSON.parse(v) : null; }, async setJSON(k, v) { db.set(k, JSON.stringify(v)); } }; } };
const origLoad = Module._load;
Module._load = function (req, ...a) { return req === "@netlify/blobs" ? mockBlobs : origLoad.call(this, req, ...a); };

let calls = [];
const PROSE = ("Gió thổi qua con phố vắng, cô bước đi giữa đêm mưa lạnh. ").repeat(60).trim();
global.fetch = async (url, init) => {
  const body = JSON.parse(init.body); const prompt = JSON.stringify(body.messages);
  const isChapter = /VIẾT CHƯƠNG|Viết TIẾP chương|Bạn đang viết CHƯƠNG THỨ/.test(prompt);
  calls.push({ model: body.model, isChapter, prompt });
  let content = PROSE;
  if (!isChapter) {
    if (prompt.includes("CẬP NHẬT NHÂN VẬT")) content = "[]";
    else if (prompt.includes("CẬP NHẬT THẾ GIỚI")) content = '{"locations":[],"items":[],"threads":[]}';
    else if (prompt.includes("bộ máy tóm tắt")) content = "**Tóm tắt chương:** Cô bước đi giữa đêm mưa lạnh trên con phố vắng.";
    else content = '{"summary":"x","timeline":[],"foreshadowing":[],"knowledgeLedger":[],"status":"ổn"}';
  }
  return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ choices: [{ message: { content }, finish_reason: "stop" }] }), text: async () => content };
};
const worker = require(path.join(__dirname, "../netlify/functions/write-chapter-background.js"));

async function run(name, { state = {}, forceNsfw = false, modelNsfw = "nsfw-model" } = {}) {
  calls = []; db.clear();
  const token = "tok", jobId = "job_" + name;
  db.set(jobId, JSON.stringify({ jobId, createdAt: Date.now(), status: "queued", schemaVersion: 9, workerTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    apiKeyEncrypted: { encrypted: false, value: "k" }, apiEndpoint: "http://mock/chat/completions", model: "normal-model", modelNsfw, forceNsfw,
    storyState: Object.assign({ chapters: [], characters: [], locations: [], items: [], threads: [], minChapterWords: 500, mature: true, nsfwMode: "auto", chapterMatureFocus: "primary", explicitLevel: "explicit", mainCharProfile: { name: "Lan", age: "26" } }, state) }));
  const res = await worker.handler({ httpMethod: "POST", body: JSON.stringify({ jobId, workerToken: token }), headers: {} });
  const job = JSON.parse(db.get(jobId));
  assert.strictEqual(res.statusCode, 200, name + ": handler " + res.statusCode + " " + res.body);
  assert.strictEqual(job.status, "completed", name + ": " + job.error);
  return { job, main: calls.find(c => c.isChapter), chapter: job.resultChapter };
}
const tests = [];
const T = (n, f) => tests.push([n, f]);

T("PRIMARY + brief 18+ -> dùng model NSFW, có rào chắn tuổi + Story Control", async () => {
  const r = await run("a", { state: { nextChapterHint: "Cảnh nóng giữa Lan và chồng, đêm tân hôn.", characters: [{ name: "Bo", age: "16 tuổi" }] } });
  assert.strictEqual(r.main.model, "nsfw-model");
  assert(r.main.prompt.includes("RÀO CHẮN TUỔI") && r.main.prompt.includes("Bo"), "thiếu rào chắn tuổi");
  assert(/STORY CONTROL|Story Control|KIỂM SOÁT/i.test(r.main.prompt), "thiếu Story Control");
  assert.strictEqual(r.chapter.control && r.chapter.control.focus, "primary");
});
T("NONE + brief 18+ -> vẫn dùng model thường, không chèn văn phong erotic", async () => {
  const r = await run("b", { state: { chapterMatureFocus: "none", nextChapterHint: "Cảnh nóng, ân ái." } });
  assert.strictEqual(r.main.model, "normal-model");
  assert(!r.main.prompt.includes("PHONG CÁCH REDQUILL"), "không được chèn văn phong erotic khi NONE");
  assert.strictEqual(r.chapter.isNsfw, false);
});
T("Câu thường ngày (cà phê, phản kháng) không bị route sang NSFW", async () => {
  const r = await run("c", { state: { nextChapterHint: "Lan uống cà phê rồi phản kháng lại sếp, ký vào cây bút." } });
  assert.strictEqual(r.main.model, "normal-model");
});
T("nsfwMode=never chặn hoàn toàn dù có từ khóa", async () => {
  const r = await run("d", { state: { nsfwMode: "never", nextChapterHint: "Cảnh nóng ân ái." } });
  assert.strictEqual(r.main.model, "normal-model");
});
T("Chưa bật mature -> không route NSFW", async () => {
  const r = await run("e", { state: { mature: false, nextChapterHint: "Cảnh nóng ân ái." } });
  assert.strictEqual(r.main.model, "normal-model");
});
T("forceNsfw + PRIMARY -> dùng model NSFW; thiếu model NSFW thì không crash", async () => {
  const r = await run("f", { forceNsfw: true });
  assert.strictEqual(r.main.model, "nsfw-model");
  const r2 = await run("g", { forceNsfw: true, modelNsfw: "" });
  assert.strictEqual(r2.main.model, "normal-model");
});
T("Output không dính nhãn TIÊU ĐỀ/NỘI DUNG và có metadata control", async () => {
  const r = await run("h");
  assert(!/^\s*(TIÊU ĐỀ|NỘI DUNG)/i.test(r.chapter.text));
  assert(r.chapter.control && typeof r.chapter.control.maxNamedCharacters === "number");
});

(async () => {
  let fail = 0;
  for (const [n, f] of tests) { try { await f(); console.log("PASS " + n); } catch (e) { fail++; console.log("FAIL " + n + " — " + e.message); } }
  console.log(`\n${tests.length - fail}/${tests.length} PASS`); process.exit(fail ? 1 : 0);
})();
