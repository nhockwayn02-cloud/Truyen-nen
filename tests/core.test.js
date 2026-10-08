// Test đơn vị cho phần Quality Gate thuần trong shared/core.js — chạy: node tests/core.test.js
const fs = require("fs"), vm = require("vm"), path = require("path"), assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "../shared/core.js"), "utf8");
const ctx = {}; vm.createContext(ctx);
vm.runInContext(src + "\n;this.__t={evaluateReview,rewriteInstructionsText,checkRewriteAcceptable,backupBeforeRewrite,mergeAiContinuityWarnings,gateMaxAttempts,GATE_MAX_VERSIONS,normalizeStoryControl,storyControlPrompt,gateHardChecks,gateKnownNames,knownNameMentions,buildQualityReviewPrompt,buildRewritePrompt,runGateLoop,bypassReview,nextCanonVersion,applyCanonSync,mergeCanonVersion,isGateFailedResult};", ctx);
const T = ctx.__t; let pass = 0, fail = 0; const pending = [];
function t(name, fn) { try { const r = fn(); if (r && r.then) { pending.push(r.then(() => { console.log("PASS " + name); pass++; }, e => { console.log("FAIL " + name + " — " + e.message); fail++; })); return; } console.log("PASS " + name); pass++; } catch (e) { console.log("FAIL " + name + " — " + e.message); fail++; } }
const base = { score: 95, mainEventCount: 1, namedCharacterCount: 2, hardFailures: [] };
const O = { maxMainEvents: 3, maxNamedCharacters: 4, passScore: 90, softFailScore: 75 };

t("evaluateReview: không phải object → null", () => { assert.strictEqual(T.evaluateReview(null, O), null); assert.strictEqual(T.evaluateReview([], O), null); assert.strictEqual(T.evaluateReview("x", O), null); });
t("evaluateReview: 95 điểm, không lỗi → PASS", () => assert.strictEqual(T.evaluateReview(base, O).verdict, "PASS"));
t("evaluateReview: ngưỡng 90/75 → PASS/SOFT_FAIL/HARD_FAIL", () => {
  assert.strictEqual(T.evaluateReview({ ...base, score: 90 }, O).verdict, "PASS");
  assert.strictEqual(T.evaluateReview({ ...base, score: 89 }, O).verdict, "SOFT_FAIL");
  assert.strictEqual(T.evaluateReview({ ...base, score: 75 }, O).verdict, "SOFT_FAIL");
  assert.strictEqual(T.evaluateReview({ ...base, score: 74 }, O).verdict, "HARD_FAIL");
});
t("evaluateReview: điểm bị kẹp 0..100, rác → 0", () => { assert.strictEqual(T.evaluateReview({ score: 250 }, O).score, 100); assert.strictEqual(T.evaluateReview({ score: "abc" }, O).score, 0); });
t("evaluateReview: vượt ngân sách sự kiện/nhân vật → HARD_FAIL dù điểm cao", () => {
  const r = T.evaluateReview({ ...base, mainEventCount: 4, namedCharacterCount: 5 }, O);
  assert.strictEqual(r.verdict, "HARD_FAIL"); assert.strictEqual(r.hardFailures.length, 2);
});
t("evaluateReview: cờ unauthorized/knowledge/retcon → HARD_FAIL", () => {
  for (const k of ["unauthorizedImportantCharacter", "knowledgeViolation", "retcon"]) assert.strictEqual(T.evaluateReview({ ...base, [k]: true }, O).verdict, "HARD_FAIL", k);
});
t("evaluateReview: extraHard được cộng vào hardFailures", () => { const r = T.evaluateReview(base, { ...O, extraHard: ["Lỗi X"] }); assert.strictEqual(r.verdict, "HARD_FAIL"); assert(r.hardFailures.includes("Lỗi X")); });
t("evaluateReview: ngưỡng mặc định khi thiếu cấu hình", () => assert.strictEqual(T.evaluateReview({ ...base, score: 80 }, {}).verdict, "SOFT_FAIL"));
t("evaluateReview: cắt độ dài mảng, dimensions luôn là object", () => {
  const r = T.evaluateReview({ ...base, hardFailures: Array(30).fill("a"), warnings: Array(50).fill("w"), rewriteInstructions: Array(40).fill("r"), dimensions: "sai" }, O);
  assert.strictEqual(r.hardFailures.length, 20); assert.strictEqual(r.warnings.length, 20); assert.strictEqual(r.rewriteInstructions.length, 12); assert.deepStrictEqual({ ...r.dimensions }, {});
});
t("rewriteInstructionsText: ưu tiên rewriteInstructions, không có thì dùng hardFailures", () => {
  assert.strictEqual(T.rewriteInstructionsText({ rewriteInstructions: ["a", "b"], hardFailures: ["x"] }), "a\nb");
  assert.strictEqual(T.rewriteInstructionsText({ hardFailures: ["x", { description: "y" }] }), "x\ny");
  assert.strictEqual(T.rewriteInstructionsText(null), "");
});
t("checkRewriteAcceptable: từ chối rỗng / ngắn hơn 60%, chấp nhận bản hợp lệ", () => {
  assert.strictEqual(T.checkRewriteAcceptable(1000, "", 0).ok, false);
  assert.strictEqual(T.checkRewriteAcceptable(1000, "x", 599).ok, false);
  assert.strictEqual(T.checkRewriteAcceptable(1000, "x", 600).ok, true);
  assert.strictEqual(T.checkRewriteAcceptable(10, "x", 20).ok, true);
});
t("backupBeforeRewrite: lưu bản gốc, mới nhất đứng đầu, tối đa 3", () => {
  const ch = { text: "một hai ba", modelUsed: "m" };
  for (let i = 0; i < 5; i++) { ch.text = "bản " + i; T.backupBeforeRewrite(ch, "n" + i); }
  assert.strictEqual(ch.versions.length, 3); assert.strictEqual(ch.versions[0].text, "bản 4"); assert.strictEqual(ch.versions[2].text, "bản 2");
});
t("mergeAiContinuityWarnings: thay cảnh báo AI cũ, giữ cảnh báo khác nguồn, không cộng dồn", () => {
  const old = [{ msg: "dup", source: "dup" }, { msg: "cũ", source: "ai" }];
  const r1 = T.mergeAiContinuityWarnings(old, [{ msg: "mới" }], 20);
  assert.deepStrictEqual(Array.from(r1).map(w => w.msg), ["dup", "mới"]);
  const r2 = T.mergeAiContinuityWarnings(r1, [{ msg: "mới" }], 20);
  assert.strictEqual(r2.length, 2);
  assert.strictEqual(T.mergeAiContinuityWarnings(null, null).length, 0);
  assert.strictEqual(T.mergeAiContinuityWarnings([], Array(30).fill({ m: 1 }), 20).length, 20);
});
t("gateMaxAttempts: 1..3", () => { assert.strictEqual(T.gateMaxAttempts(undefined), 3); assert.strictEqual(T.gateMaxAttempts(9), 3); assert.strictEqual(T.gateMaxAttempts(1), 1); assert.strictEqual(T.gateMaxAttempts(-2), 1); });

/* ---- Story Control ---- */
t("normalizeStoryControl: mặc định + kẹp giới hạn", () => {
  const d = T.normalizeStoryControl({}); assert.strictEqual(d.maxMainEvents, 3); assert.strictEqual(d.maxNamedCharacters, 4); assert(d.noRetcon);
  const c = T.normalizeStoryControl({ storyControl: { maxMainEvents: 9, maxNamedCharacters: 99, maxNewThreads: 50, noRetcon: false } });
  assert.strictEqual(c.maxMainEvents, 3); assert.strictEqual(c.maxNamedCharacters, 6); assert.strictEqual(c.maxNewThreads, 5); assert.strictEqual(c.noRetcon, false);
});
t("storyControlPrompt: nêu đúng ngân sách; tắt NO RETCON thì bỏ dòng đó", () => {
  const p = T.storyControlPrompt({ storyControl: { maxMainEvents: 2, maxNamedCharacters: 5, noRetcon: false } });
  assert(p.includes("tối đa 2 sự kiện chính") && p.includes("tối đa: 5") === false && p.includes("tối đa 5;")); assert(!p.includes("NO RETCON"));
  assert(T.storyControlPrompt(null).includes("NO RETCON"));
});
/* ---- Kiểm tra cứng ---- */
const words = n => Array.from({ length: n }, (_, i) => "từ" + i).join(" ");
t("gateHardChecks: bản đủ dài/tiếng Việt → tất cả ok; quá ngắn/continuity cao → trượt", () => {
  assert(T.gateHardChecks({ text: words(200) }).every(c => c.ok));
  assert.strictEqual(T.gateHardChecks({ text: "ngắn" }).find(c => c.id === "text_nonempty").ok, false);
  assert.strictEqual(T.gateHardChecks({ text: words(200), continuityWarnings: [{ severity: "critical" }] }).find(c => c.id === "duplicate").ok, false);
  assert.strictEqual(T.gateHardChecks({ text: words(200), continuityWarnings: [{ severity: "low" }] }).find(c => c.id === "duplicate").ok, true);
  assert.strictEqual(T.gateHardChecks(null).length, 3);
});
t("gateKnownNames + knownNameMentions: khớp nguyên từ, phân biệt hoa/thường, chỉ tên có thật", () => {
  const names = T.gateKnownNames({ mainCharProfile: { name: "Minh Khoa" }, characters: [{ name: "Lan" }, { name: "Lan" }, { name: "A" }, { name: "Hoa" }] });
  assert.deepStrictEqual(Array.from(names), ["Minh Khoa", "Lan", "Hoa"]);
  const f = T.knownNameMentions("Minh Khoa gặp Lan. Mưa làn lan tỏa, hoa nở. Lanh lợi.", names);
  assert.deepStrictEqual(Array.from(f), ["Minh Khoa", "Lan"]);
  assert.deepStrictEqual(Array.from(T.knownNameMentions("", names)), []);
});
/* ---- Prompt ---- */
t("buildQualityReviewPrompt: có đủ khối, cắt độ dài, bỏ dòng tên đã biết khi rỗng", () => {
  const p = T.buildQualityReviewPrompt({ storyControl: "SC", contract: "C", context: "x".repeat(30000), draft: "y".repeat(60000), maxMainEvents: 2, maxNamedCharacters: 5, hardChecks: [{ id: "a", ok: true }], knownNames: [] });
  assert(p.startsWith("Bạn là QUALITY AUDITOR") && p.includes("SCHEMA: {") && p.includes("tối đa 2") && p.includes("tối đa 5") && p.includes("KIỂM TRA CỨNG"));
  assert(!p.includes("TÊN NHÂN VẬT ĐÃ BIẾT")); assert(p.length < 30000 + 60000);
  assert(T.buildQualityReviewPrompt({ knownNames: ["Lan"], contractLabel: "CHAPTER BRIEF" }).includes("TÊN NHÂN VẬT ĐÃ BIẾT XUẤT HIỆN TRONG VĂN BẢN (đếm tự động, chỉ để tham khảo khi đếm namedCharacterCount): Lan"));
  assert(T.buildQualityReviewPrompt({ contractLabel: "CHAPTER BRIEF" }).includes("CHAPTER BRIEF:"));
});
t("buildRewritePrompt: bắt đầu 'SỬA LẠI', có hướng sửa + bản thảo, context tùy chọn", () => {
  const r = { rewriteInstructions: ["bỏ nhân vật X"], hardFailures: ["h"] };
  const p = T.buildRewritePrompt({ chapterNumber: 7, review: r, draft: "BẢN THẢO ABC", context: "CTX" });
  assert(p.startsWith("SỬA LẠI BẢN THẢO CHƯƠNG 7") && p.includes("bỏ nhân vật X") && p.includes("BẢN THẢO ABC") && p.includes("CANON CONTEXT:\nCTX"));
  assert(!T.buildRewritePrompt({ chapterNumber: 1, review: r, draft: "d" }).includes("CANON CONTEXT"));
});
/* ---- Vòng lặp Gate (giả lập deps) ---- */
const R = (verdict, extra) => ({ ok: true, review: Object.assign({ score: verdict === "PASS" ? 95 : 60, verdict, hardFailures: [], warnings: [], rewriteInstructions: ["sửa"] }, extra || {}) });
function deps(reviews, rewrites, log) {
  let i = 0, j = 0;
  return { review: async () => { log.push("review"); return reviews[Math.min(i++, reviews.length - 1)]; }, rewrite: async () => { log.push("rewrite"); return rewrites[Math.min(j++, rewrites.length - 1)]; }, onStatus: m => log.push("status:" + m) };
}
t("runGateLoop: PASS ngay → APPROVED, không sửa", async () => {
  const log = [], ch = { status: "DRAFTED" }; const r = await T.runGateLoop(ch, deps([R("PASS")], [], log), {});
  assert(r.approved); assert.strictEqual(ch.status, "APPROVED"); assert.deepStrictEqual(log, ["review"]); assert.strictEqual(ch.review.status, "completed"); assert.strictEqual(ch.review.attempt, 1);
});
t("runGateLoop: trượt → sửa → PASS ở lần 2, có thông báo tiến độ", async () => {
  const log = [], ch = {}; const r = await T.runGateLoop(ch, deps([R("HARD_FAIL"), R("PASS")], [{ ok: true }], log), {});
  assert(r.approved); assert.strictEqual(ch.review.attempt, 2); assert.deepStrictEqual(log.filter(x => !x.startsWith("status")), ["review", "rewrite", "review"]);
  assert(log.some(x => x.includes("lần 2/3")));
});
t("runGateLoop: luôn trượt → đúng 3 lần chấm, 2 lần sửa, REVISION_REQUIRED", async () => {
  const log = [], ch = {}; const r = await T.runGateLoop(ch, deps([R("SOFT_FAIL")], [{ ok: true }], log), {});
  assert.strictEqual(r.approved, false); assert.strictEqual(ch.status, "REVISION_REQUIRED");
  assert.strictEqual(log.filter(x => x === "review").length, 3); assert.strictEqual(log.filter(x => x === "rewrite").length, 2);
});
t("runGateLoop: allowRewrite=false → chỉ chấm 1 lần, không sửa", async () => {
  const log = [], ch = {}; const r = await T.runGateLoop(ch, deps([R("HARD_FAIL")], [{ ok: true }], log), { allowRewrite: false });
  assert.strictEqual(r.approved, false); assert.deepStrictEqual(log, ["review"]);
});
t("runGateLoop: bản sửa bị từ chối → dừng, giữ cảnh báo, không chấm lại", async () => {
  const log = [], ch = {}; const r = await T.runGateLoop(ch, deps([R("HARD_FAIL")], [{ ok: false, reason: "quá ngắn" }], log), {});
  assert.strictEqual(r.approved, false); assert.strictEqual(log.filter(x => x === "review").length, 1);
  assert(ch.review.warnings.some(w => w.includes("Bản sửa bị từ chối: quá ngắn")));
});
t("runGateLoop: lỗi review → REVIEW_ERROR + REVISION_REQUIRED, trả error", async () => {
  const log = [], ch = {}; const r = await T.runGateLoop(ch, deps([{ ok: false, reason: "review_parse" }], [], log), {});
  assert.strictEqual(r.approved, false); assert.strictEqual(r.error, "review_parse"); assert.strictEqual(ch.review.verdict, "REVIEW_ERROR"); assert.strictEqual(ch.status, "REVISION_REQUIRED");
});
t("runGateLoop: người dùng dừng (trước lượt chấm / khi đang sửa) → stopped", async () => {
  let ch = {}; assert((await T.runGateLoop(ch, { review: async () => R("PASS"), rewrite: async () => ({ ok: true }), shouldStop: () => true }, {})).stopped);
  ch = {}; const r = await T.runGateLoop(ch, { review: async () => R("HARD_FAIL"), rewrite: async () => ({ stopped: true }) }, {});
  assert(r.stopped && !r.approved);
});
t("runGateLoop: tắt Gate → BYPASS, không gọi review", async () => {
  let called = 0, ch = {}; const r = await T.runGateLoop(ch, { review: async () => { called++; return R("PASS"); } }, { enabled: false });
  assert(r.approved && called === 0 && ch.status === "APPROVED" && ch.review.verdict === "BYPASS");
});
t("runGateLoop: selfCheck chạy trước mỗi lượt chấm; onChange được gọi", async () => {
  const log = []; let changes = 0; const ch = {};
  await T.runGateLoop(ch, { selfCheck: async () => { log.push("self"); }, review: async () => { log.push("review"); return R("PASS"); }, onChange: () => changes++ }, {});
  assert.deepStrictEqual(log, ["self", "review"]); assert(changes >= 2);
});
/* ---- Canon / job nền ---- */
t("nextCanonVersion/applyCanonSync: tăng từ max(chương, state); SYNCED vs SYNCED_WITH_WARNINGS", () => {
  const st = { canonVersion: 2, chapters: [{ sync: { canonVersion: 5 } }, {}] };
  assert.strictEqual(T.nextCanonVersion(st), 6);
  const ch = { autoUpdateIssues: [] }; const v = T.applyCanonSync(st, ch, 123);
  assert.strictEqual(v, 6); assert.strictEqual(st.canonVersion, 6); assert.strictEqual(ch.canonVersion, 6); assert.strictEqual(ch.status, "SYNCED"); assert.strictEqual(ch.sync.syncedAt, 123);
  const ch2 = { autoUpdateIssues: ["NV: lỗi"], sync: { startedAt: 9 } }; T.applyCanonSync(st, ch2);
  assert.strictEqual(ch2.status, "SYNCED_WITH_WARNINGS"); assert.strictEqual(ch2.sync.canonVersion, 7); assert.strictEqual(ch2.sync.startedAt, 9);
  assert.strictEqual(T.nextCanonVersion({}), 1); assert.strictEqual(T.nextCanonVersion(null), 1);
});
t("mergeCanonVersion: lấy số lớn hơn, chịu được rác", () => { assert.strictEqual(T.mergeCanonVersion(3, 7), 7); assert.strictEqual(T.mergeCanonVersion(9, undefined), 9); assert.strictEqual(T.mergeCanonVersion("x", null), 0); });
t("isGateFailedResult: cờ server / chương kết quả / chương cuối REVISION_REQUIRED; bình thường → false", () => {
  assert(T.isGateFailedResult({ qualityGateFailed: true }));
  assert(T.isGateFailedResult({ resultChapter: { status: "REVISION_REQUIRED" } }));
  assert(T.isGateFailedResult({ storyState: { chapters: [{ status: "SYNCED" }, { status: "REVISION_REQUIRED" }] } }));
  assert(!T.isGateFailedResult({ storyState: { chapters: [{ status: "REVISION_REQUIRED" }, { status: "SYNCED" }] }, resultChapter: { status: "SYNCED" } }));
  assert(!T.isGateFailedResult(null)); assert(!T.isGateFailedResult({}));
});
t("bypassReview: verdict BYPASS, không hard failure", () => { const b = T.bypassReview(); assert.strictEqual(b.verdict, "BYPASS"); assert.strictEqual(b.hardFailures.length, 0); });
Promise.all(pending).then(() => {
  console.log(`\n${pass}/${pass + fail} PASS`); process.exit(fail ? 1 : 0);
});
