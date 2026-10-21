// V14.0.6 — Viết NHÁP nền: worker dùng đúng pipeline Adaptive Scene (Contract + Scene Graph) của "Tạo Chương Hoàn Chỉnh".
// Kiểm tra: (1) nháp chỉ viết + lưu "Bản nháp", KHÔNG chạy Gate/hậu kỳ; (2) plan lệch bị từ chối, KHÔNG lùi về writer cũ;
// (3) job viết thường (không draftOnly) vẫn đi qua adaptive rồi Gate + hậu kỳ; (4) cụm "bảo vệ/bác sĩ/khách" không bị chặn nhầm.
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
let shortScenes = false, topUpCalls = 0, planSeq = null;
let calls = [], planOverride = null, reviewBroken = false, restartScene2 = false, scene1Text = "";
const GRAPH = (chars) => JSON.stringify({
  chapterGoal: "Lan bảo vệ hồ sơ trước khi khách đến", endingAnchor: "Lan khóa cửa văn phòng lúc bác sĩ gọi điện.",
  scenes: [1, 2, 3].map(n => ({ id: "S" + n, location: "Văn phòng", time: "Tối " + n, characters: chars, purpose: "tiến triển " + n, beats: ["beat " + n], mustChange: "Lan biết thêm điều " + n, handoff: "sang cảnh " + (n + 1), targetWords: 1700 }))
});
global.fetch = async (url, init) => {
  const body = JSON.parse(init.body); const sys = (body.messages.find(m => m.role === "system") || {}).content || ""; const prompt = JSON.stringify(body.messages);
  const kind = prompt.includes("VIẾT BỔ SUNG TIẾP NỐI") ? "topup" : /Lập kế hoạch scene/.test(sys) ? "plan" : /scene nối tiếp/.test(sys) ? "scene" : prompt.includes("HẬU KỲ TỔNG HỢP CHO CHƯƠNG") ? "unified" : prompt.includes("QUALITY AUDITOR") ? "review" : "other";
  calls.push(kind);
  let content;
  if (kind === "plan") content = (planSeq && planSeq.length) ? planSeq.shift() : (planOverride || GRAPH(["Lan"]));
  else if (kind === "topup") { topUpCalls++; content = (topUpCalls === 1 && shortScenes) ? "Quá ngắn." : prose(50 + topUpCalls, 700); }
  else if (kind === "scene") {
    const k = calls.filter(c => c === "scene").length;
    content = prose(k, shortScenes ? 1000 : 1650);
    if (k === 1) scene1Text = content;
    if (k === 2 && restartScene2) content = scene1Text.split("\n\n").slice(0, 8).join("\n\n") + "\n\n" + content; // scene 2 mở đầu lại cảnh 1
  }
  else if (kind === "review" && reviewBroken) content = "không phải JSON";
  else if (kind === "review") content = JSON.stringify({ score: 96, verdict: "PASS", dimensions: {}, hardFailures: [], warnings: [], suggestions: [], rewriteInstructions: [], canonWarnings: [] });
  else if (kind === "unified") content = JSON.stringify({ summary: "**Tóm tắt chương:** Lan bước đi giữa đêm.", characters: [], world: { locations: [], items: [] }, status: { changes: { characterChanges: [], conflicts: [] } }, memory: { events: [], foreshadowing: [], knowledge: [] }, continuityWarnings: [], nextChapterHint: "**Gợi ý ngắn Chương 2:** Lan tiếp tục." });
  else content = '{"summary":"x","timeline":[],"foreshadowing":[],"knowledgeLedger":[],"status":"ổn"}';
  return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ choices: [{ message: { content }, finish_reason: "stop" }] }), text: async () => content };
};
const worker = require(path.join(__dirname, "../netlify/functions/write-chapter-background.js"));
async function run(name, extra = {}, stateExtra = {}) {
  calls = []; db.clear();
  const token = "tok", jobId = "job_" + name;
  db.set(jobId, JSON.stringify(Object.assign({ jobId, createdAt: Date.now(), status: "queued", schemaVersion: 9, workerTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    apiKeyEncrypted: { encrypted: false, value: "k" }, apiEndpoint: "http://mock/chat/completions", model: "m", modelNsfw: "",
    storyState: Object.assign({ chapters: [], characters: [], locations: [], items: [], threads: [], mature: false, nsfwMode: "never", mainCharProfile: { name: "Lan" },
      arcs: [{ id: "a1", name: "Arc 1", goal: "Lan giữ hồ sơ", active: true }], chapterOutline: "" }, stateExtra) }, extra)));
  const res = await worker.handler({ httpMethod: "POST", body: JSON.stringify({ jobId, workerToken: token }), headers: {} });
  return { res, job: JSON.parse(db.get(jobId)) };
}
(async () => {
  // 1) Nháp: chỉ viết, lưu Bản nháp, không Gate/hậu kỳ
  let r = await run("draft", { draftOnly: true });
  assert.strictEqual(r.res.statusCode, 200, "draft: " + r.res.statusCode + " " + r.res.body);
  assert.strictEqual(r.job.status, "completed", "draft: " + r.job.error);
  assert(r.job.draftOnly, "job phải đánh dấu draftOnly");
  const ch = r.job.resultChapter; if (process.env.DBG) console.log(JSON.stringify({calls, issues: ch.autoUpdateIssues, wc: ch.wordCount}));
  assert.strictEqual(ch.status, "DRAFTED", "nháp phải ở trạng thái DRAFTED, đang là " + ch.status);
  assert.strictEqual(ch.postProcess.status, "PENDING_REVIEW");
  assert(ch.wordCount >= 4500 && ch.wordCount <= 5600, "nháp phải đạt 4.500–5.600 từ, đang là " + ch.wordCount);
  assert(/V14 CHAPTER CONTRACT/.test(ch.plan) && /ADAPTIVE SCENE GRAPH/.test(ch.plan), "plan phải mang Chapter Contract + Scene Graph");
  assert.strictEqual(r.job.storyState.chapters.length, 1);
  assert(!r.job.storyState.canonVersion, "nháp không được Sync Canon");
  assert.deepStrictEqual([calls.filter(c => c === "plan").length, calls.filter(c => c === "scene").length], [1, 3], "1 plan + 3 scene: " + JSON.stringify(calls));
  assert(!calls.includes("unified"), "nháp không được chạy hậu kỳ: " + JSON.stringify(calls));
  assert.strictEqual(calls.filter(c => c === "review").length, 1, "chấm nhanh = đúng 1 lần review, không vòng sửa: " + JSON.stringify(calls));
  assert(ch.quickCheck && ch.quickCheck.ok && ch.quickCheck.verdict === "PASS" && ch.quickCheck.score === 96, "phiếu chấm nhanh: " + JSON.stringify(ch.quickCheck));
  assert(ch.review.verdict === "PASS" && ch.review.quickCheck === true, "review phải được lưu để khung Quality hiển thị");
  assert.strictEqual(ch.status, "DRAFTED", "chấm nhanh không được đổi trạng thái Bản nháp");
  assert(!ch.autoUpdateIssues.some(x => /Thiếu từ/.test(x)), "không báo thiếu từ: " + JSON.stringify(ch.autoUpdateIssues));

  // 1b) Tắt chấm nhanh -> không gọi review; review lỗi -> job vẫn hoàn tất, phiếu báo "chưa chấm được"
  r = await run("draft_noqc", { draftOnly: true, quickCheck: false });
  assert.strictEqual(r.job.status, "completed"); assert(!calls.includes("review") && !r.job.resultChapter.quickCheck, "quickCheck=false không được review");
  reviewBroken = true;
  r = await run("draft_qcfail", { draftOnly: true });
  reviewBroken = false;
  assert.strictEqual(r.job.status, "completed", "review lỗi không được làm fail nháp: " + r.job.error);
  assert(r.job.resultChapter.quickCheck && r.job.resultChapter.quickCheck.ok === false && r.job.resultChapter.status === "DRAFTED", "phiếu phải báo chưa chấm được: " + JSON.stringify(r.job.resultChapter.quickCheck));

  // 1b2) Model viết scene ngắn (~3.000 từ) + lượt bù đầu hỏng (quá ngắn): vẫn phải bù tới >= 4.500 từ, không dừng ở ~4.100
  shortScenes = true; topUpCalls = 0;
  r = await run("draft_short", { draftOnly: true, quickCheck: false });
  shortScenes = false;
  assert(r.job.resultChapter, "draft_short phải xong: " + r.job.error);
  assert(r.job.resultChapter.wordCount >= 4500, "chương phải bù đủ >= 4.500 từ, đang là " + r.job.resultChapter.wordCount + " " + JSON.stringify(r.job.resultChapter.autoUpdateIssues));
  assert(topUpCalls >= 3, "phải bù nhiều lượt (1 hỏng + >=2 tốt): " + topUpCalls);
  assert(!r.job.resultChapter.autoUpdateIssues.some(x => /Thiếu từ/.test(x)), "không được báo thiếu từ: " + JSON.stringify(r.job.resultChapter.autoUpdateIssues));

  // 1c) Scene 2 viết lặp phần mở đầu của scene 1 -> bị cắt, có ghi chú + telemetry
  restartScene2 = true;
  r = await run("draft_dup", { draftOnly: true, quickCheck: false });
  restartScene2 = false;
  assert(r.job.resultChapter, "draft_dup phải xong: " + r.job.error); if (process.env.DBG) console.log("DUP", r.job.resultChapter.wordCount, JSON.stringify(r.job.resultChapter.autoUpdateIssues));
  const dupParas = r.job.resultChapter.text.split("\n\n").filter(x => countWordsT(x) > 15);
  assert.strictEqual(new Set(dupParas).size, dupParas.length, "không được còn đoạn trùng nguyên văn");
  assert(r.job.resultChapter.autoUpdateIssues.some(x => /đã cắt 1 đoạn viết lặp/.test(x)), "phải ghi telemetry cắt lặp: " + JSON.stringify(r.job.resultChapter.autoUpdateIssues));
  assert(r.job.resultChapter.autoUpdateIssues.some(x => /Adaptive: 3\/3 scene/.test(x)), "phải có telemetry Adaptive: " + JSON.stringify(r.job.resultChapter.autoUpdateIssues));
  // contract đưa vào prompt không chứa userBrief (chống tràn quy tắc chương vào mọi prompt)
  assert(!/"userBrief"/.test(r.job.resultChapter.plan), "plan/contract hiển thị không được chứa userBrief");

  // 1d) Model trả văn bản rác ở lần plan đầu -> lần 2 đúng JSON thì vẫn chạy; rác cả hai lần -> lỗi có trích đoạn để chẩn đoán
  planSeq = ["Xin lỗi, tôi không thể viết kế hoạch này."];
  r = await run("plan_retry", { draftOnly: true, quickCheck: false });
  assert.strictEqual(r.job.status, "completed", "plan lần 2 hợp lệ phải chạy tiếp: " + r.job.error);
  assert.strictEqual(calls.filter(c => c === "plan").length, 2);
  planSeq = ["Tôi từ chối yêu cầu A.", "Tôi từ chối yêu cầu B."];
  r = await run("plan_garbage", { draftOnly: true, quickCheck: false });
  planSeq = null;
  assert.strictEqual(r.job.status, "failed");
  assert(/PLAN_REJECTED: Không parse được JSON/.test(r.job.error) && /Tôi từ chối yêu cầu B/.test(r.job.error), "lỗi phải kèm trích đoạn model trả: " + r.job.error);

  // 2) Plan lệch cast -> PLAN_REJECTED, không lùi về writer cũ
  planOverride = GRAPH(["Kim Chi Hoàng"]);
  r = await run("reject", { draftOnly: true }, { characters: [{ name: "Lan" }] });
  planOverride = null;
  assert.strictEqual(r.job.status, "failed", "plan lệch phải làm job fail, đang là " + r.job.status);
  assert(/PLAN_REJECTED/.test(r.job.error), "lỗi phải là PLAN_REJECTED: " + r.job.error);
  assert(calls.every(c => c === "plan"), "không được viết scene/writer cũ sau khi plan bị từ chối: " + JSON.stringify(calls));
  assert.strictEqual(calls.length, 2, "plan được thử đúng 2 lần");

  // 3) Job viết thường (không draftOnly): adaptive -> Gate -> hậu kỳ -> Sync
  r = await run("full", {});
  assert.strictEqual(r.res.statusCode, 200, "full: " + r.res.statusCode + " " + r.res.body);
  assert.strictEqual(r.job.status, "completed", "full: " + r.job.error);
  assert(["SYNCED", "SYNCED_WITH_WARNINGS"].includes(r.job.resultChapter.status), "full: status " + r.job.resultChapter.status);
  assert(calls.includes("review") && calls.includes("unified"), "full phải chạy Gate + hậu kỳ: " + JSON.stringify(calls));
  assert.strictEqual(calls.filter(c => c === "scene").length, 3);
  console.log("PASS V14.0.6 viết nháp nền: (nháp + chấm nhanh, tắt/lỗi chấm, từ chối plan, viết thường)");
})().catch(e => { console.error("FAIL", e.stack || e.message); process.exit(1); });
