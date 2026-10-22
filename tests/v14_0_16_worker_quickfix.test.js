// V14.0.16 — worker nền: TỰ SỬA SAU CHẤM NHANH (nháp vẫn là nháp: không Gate đầy đủ, không hậu kỳ, không Canon).
const Module = require("module"), crypto = require("crypto"), path = require("path"), assert = require("assert");
const db = new Map();
const mockBlobs = { connectLambda() {}, getStore() { return { async get(k) { const v = db.get(k); return v ? JSON.parse(v) : null; }, async setJSON(k, v) { db.set(k, JSON.stringify(v)); } }; } };
const origLoad = Module._load;
Module._load = function (req, ...a) { return req === "@netlify/blobs" ? mockBlobs : origLoad.call(this, req, ...a); };

const countWordsT = t => t.trim().split(/\s+/).filter(Boolean).length;
let _seed = 12345;
const rnd = () => (_seed = (_seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const ON = "b c d g h k l m n t v x ch th nh kh ph tr gi qu".split(" "), RI = "a à á ạ e ê ề i í o ô ố ơ u ư ừ an ân ăn em ên in on ôn ơn un ang anh ênh inh ong ông ung ưng at ât ap ep ip op ôp ưc ac oc ai ay ôi".split(" ");
const word = () => ON[Math.floor(rnd() * ON.length)] + RI[Math.floor(rnd() * RI.length)];
function prose(seed, nWords) {
  const paras = []; let w = 0;
  while (w < nWords) {
    const sent = []; const n = 10 + Math.floor(rnd() * 12);
    for (let k = 0; k < n; k++) sent.push(word());
    sent[0] = sent[0][0].toUpperCase() + sent[0].slice(1);
    paras.push(sent.join(" ") + ".");
    w += n;
  }
  return paras.join("\n\n");
}

let calls = [], reviewSeq = [], scenesPerChapter = 0, patchMode = "insert", patchText = "ĐÃ VÁ BEAT R1 bằng một đoạn chuyển cảnh ngắn tự nhiên giữa hai nhân vật trong văn phòng.";
const GRAPH = JSON.stringify({
  chapterGoal: "Lan bảo vệ hồ sơ trước khi khách đến", endingAnchor: "Lan khóa cửa văn phòng lúc bác sĩ gọi điện.",
  scenes: [1, 2, 3].map(n => ({ id: "S" + n, location: "Văn phòng", time: "Tối " + n, characters: ["Lan"], purpose: "tiến triển " + n, beats: ["beat " + n], mustChange: "Lan biết thêm điều " + n, handoff: "sang cảnh " + (n + 1), targetWords: 1700 }))
});
const REVIEW = (score, verdict, hard) => JSON.stringify({ score, verdict, dimensions: {}, hardFailures: hard || [], warnings: [], suggestions: [], rewriteInstructions: ["Thêm beat [R1]"], canonWarnings: [] });
global.fetch = async (url, init) => {
  const body = JSON.parse(init.body); const sys = (body.messages.find(m => m.role === "system") || {}).content || ""; const prompt = JSON.stringify(body.messages);
  const kind = prompt.includes("VÁ CỤC BỘ BẢN THẢO CHƯƠNG") ? "patch" : prompt.includes("VIẾT BỔ SUNG TIẾP NỐI") ? "topup" : /Lập kế hoạch scene/.test(sys) ? "plan" : /scene nối tiếp/.test(sys) ? "scene" : prompt.includes("HẬU KỲ TỔNG HỢP CHO CHƯƠNG") ? "unified" : prompt.includes("QUALITY AUDITOR") ? "review" : "other";
  calls.push(kind);
  let content;
  if (kind === "plan") content = GRAPH;
  else if (kind === "topup") content = prose(50, 700);
  else if (kind === "scene") content = prose(calls.filter(c => c === "scene").length, 1650);
  else if (kind === "patch") content = patchMode === "garbage" ? "không phải json" : JSON.stringify({ patches: [{ op: "insert_before_end", text: patchText }] });
  else if (kind === "review") content = reviewSeq.length ? reviewSeq.shift() : REVIEW(96, "PASS");
  else content = "{}";
  return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ choices: [{ message: { content }, finish_reason: "stop" }] }), text: async () => content };
};
const worker = require(path.join(__dirname, "../netlify/functions/write-chapter-background.js"));
async function run(name, extra = {}) {
  calls = []; db.clear();
  const token = "tok", jobId = "job_" + name;
  db.set(jobId, JSON.stringify(Object.assign({ jobId, createdAt: Date.now(), status: "queued", schemaVersion: 9, workerTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    apiKeyEncrypted: { encrypted: false, value: "k" }, apiEndpoint: "http://mock/chat/completions", model: "m", modelNsfw: "", draftOnly: true, quickCheck: true,
    storyState: { chapters: [], characters: [], locations: [], items: [], threads: [], mature: false, nsfwMode: "never", mainCharProfile: { name: "Lan" }, arcs: [{ id: "a1", name: "Arc 1", goal: "Lan giữ hồ sơ", active: true }], chapterOutline: "" } }, extra)));
  const res = await worker.handler({ httpMethod: "POST", body: JSON.stringify({ jobId, workerToken: token }), headers: {} });
  return { res, job: JSON.parse(db.get(jobId)) };
}
const cnt = k => calls.filter(c => c === k).length;
(async () => {
  let r;
  // 1) HARD_FAIL → tự sửa (vá) → chấm lại PASS: giữ bản sửa, vẫn là NHÁP
  reviewSeq = [REVIEW(55, "HARD_FAIL", ["Thiếu beat [R1]"]), REVIEW(91, "PASS")];
  r = await run("fix_ok");
  let ch = r.job.resultChapter;
  assert.strictEqual(r.job.status, "completed", r.job.error);
  assert.deepStrictEqual([cnt("review"), cnt("patch")], [2, 1], "1 chấm + 1 vá + 1 chấm lại: " + JSON.stringify(calls));
  assert(ch.text.includes("ĐÃ VÁ BEAT R1"), "bản sửa phải được giữ");
  assert(ch.quickCheck.ok && ch.quickCheck.verdict === "PASS" && ch.quickCheck.score === 91 && ch.quickCheck.fix.improved && !ch.quickCheck.fix.restored, JSON.stringify(ch.quickCheck));
  assert.deepStrictEqual([ch.quickCheck.fix.before.score, ch.quickCheck.fix.after.score], [55, 91]);
  assert(ch.review.quickFixed === true && ch.review.verdict === "PASS", "khung Quality phải hiện kết quả sau sửa");
  assert.strictEqual(ch.status, "DRAFTED"); assert(!calls.includes("unified"), "không hậu kỳ"); assert(!r.job.storyState.canonVersion, "không Sync Canon");
  assert.strictEqual(ch.wordCount, countWordsT(ch.text), "wordCount phải cập nhật theo bản sửa");

  // 2) Bản sửa KÉM HƠN → khôi phục bản gốc
  reviewSeq = [REVIEW(60, "HARD_FAIL", ["Thiếu beat [R1]"]), REVIEW(40, "HARD_FAIL", ["Thiếu beat [R1]", "Lệch giọng"])];
  r = await run("fix_worse"); ch = r.job.resultChapter;
  assert(!ch.text.includes("ĐÃ VÁ BEAT R1"), "bản sửa kém hơn phải bị bỏ");
  assert(ch.quickCheck.fix.restored && !ch.quickCheck.fix.improved && ch.quickCheck.score === 60 && ch.quickCheck.verdict === "HARD_FAIL", JSON.stringify(ch.quickCheck));
  assert.strictEqual(ch.status, "DRAFTED");

  // 3) Tắt tự sửa → đúng 1 review, không vá (hành vi V14.0.6 giữ nguyên)
  reviewSeq = [REVIEW(55, "HARD_FAIL", ["Thiếu beat [R1]"])];
  r = await run("fix_off", { autoFixQuick: false }); ch = r.job.resultChapter;
  assert.deepStrictEqual([cnt("review"), cnt("patch")], [1, 0], JSON.stringify(calls)); assert(!ch.quickCheck.fix && ch.quickCheck.verdict === "HARD_FAIL");

  // 4) PASS ngay → không sửa
  reviewSeq = [REVIEW(96, "PASS")];
  r = await run("fix_pass"); assert.deepStrictEqual([cnt("review"), cnt("patch")], [1, 0], JSON.stringify(calls)); assert(!r.job.resultChapter.quickCheck.fix);

  // 5) Chỉ cảnh báo văn phong nhẹ (SOFT_FAIL, không lỗi nặng, không cảnh báo Canon) → không ép sửa
  reviewSeq = [JSON.stringify({ score: 80, verdict: "SOFT_FAIL", dimensions: {}, hardFailures: [], warnings: ["Câu hơi lặp nhịp"], suggestions: [], rewriteInstructions: [], canonWarnings: [] })];
  r = await run("fix_soft"); assert.strictEqual(cnt("patch"), 0, "SOFT_FAIL chỉ văn phong không được tốn lượt sửa: " + JSON.stringify(calls));

  // 6) AI vá trả rác → không làm hỏng nháp, ghi lý do
  patchMode = "garbage"; reviewSeq = [REVIEW(55, "HARD_FAIL", ["Thiếu beat [R1]"])];
  r = await run("fix_garbage"); patchMode = "insert"; ch = r.job.resultChapter;
  assert.strictEqual(r.job.status, "completed", r.job.error);
  assert(ch.quickCheck.ok && ch.quickCheck.fix && ch.quickCheck.fix.rounds === 1 && !ch.quickCheck.fix.improved && /bị từ chối/.test(ch.quickCheck.fix.reason), JSON.stringify(ch.quickCheck));
  assert(ch.quickCheck.verdict === "HARD_FAIL" && ch.quickCheck.score === 55 && ch.status === "DRAFTED", "giữ nguyên phiếu gốc: " + JSON.stringify(ch.quickCheck));
  assert(ch.wordCount >= 4500, "nháp không được mất từ: " + ch.wordCount);

  console.log("PASS V14.0.16 worker: tự sửa sau chấm nhanh (6 kịch bản)");
})().catch(e => { console.error("FAIL", e && e.stack || e); process.exit(1); });
