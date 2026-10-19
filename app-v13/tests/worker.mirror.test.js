// V12.23 — viết nền dùng ĐÚNG code dựng ngữ cảnh/prompt của viết thường (khối CLIENT-MIRROR)
const fs = require("fs"), vm = require("vm"), path = require("path"), assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "../netlify/functions/write-chapter-background.js"), "utf8");
const mod = { exports: {} };
const sandbox = { module: mod, exports: mod.exports, console, process, Buffer, setTimeout, clearTimeout, URL, AbortController, TextDecoder, TextEncoder,
  require: (n) => (n === "@netlify/blobs" ? { getStore() {}, connectLambda() {} } : require(n)), fetch: async () => { throw new Error("no network"); } };
vm.createContext(sandbox);
vm.runInContext(src + "\n;module.exports.__t={__setMirrorState,buildContextBlock,buildMainWritePrompt,buildRecentBlocks,buildVocabularyBlock,DESCRIPTION_PROMPTS,EXPLICIT_PROMPTS};", sandbox);
const T = mod.exports.__t; let pass = 0, fail = 0;
function t(n, f) { try { f(); console.log("PASS " + n); pass++; } catch (e) { console.log("FAIL " + n + " — " + e.message); fail++; } }
const state = {
  chapters: [{ title: "Một", text: "Mưa đổ xuống phố cũ. ".repeat(60), summary: "Mở đầu", wordCount: 300 }, { title: "Hai", text: "Cô khép cửa lại. ".repeat(60), summary: "Tiếp", wordCount: 300 }],
  mainPlot: "Cuộc đấu trí giữa hai người.", worldSetting: "Thành phố hiện đại.", mainCharProfile: { name: "Mỹ Duyên", personality: "kiêu kỳ", currentLocation: "biệt thự" },
  characters: [{ name: "Bùi Lạc", tier: "main", role: "bảo vệ", currentLocation: "sảnh", aliases: [] }, { name: "Tịnh Nhã", tier: "supporting", role: "sếp" }],
  locations: [{ name: "Biệt thự", status: "active", description: "Nhà riêng" }], items: [{ name: "Hồ sơ", status: "active", description: "Tập hồ sơ mật" }],
  threads: [{ type: "mystery", desc: "Ai lấy hồ sơ", status: "open" }], foreshadowing: [], timeline: [], knowledgeLedger: [],
  directive: "", nextChapterHint: "Sáng sớm cô thức dậy trong biệt thự.\nHắn đưa cô đến công ty.\nCuối cùng cô lấy được hồ sơ thứ ba.", minChapterWords: 5000,
  descriptionLevel: "balanced", explicitLevel: "sensual", lorebook: [], mature: true, chapterMatureFocus: "none"
};
t("Hàm của viết thường có mặt trong worker", () => { ["buildContextBlock", "buildMainWritePrompt", "buildRecentBlocks"].forEach(n => assert.strictEqual(typeof T[n], "function", n)); });
t("buildContextBlock chạy trong worker và có cả địa điểm/vật phẩm/threads (worker cũ không có)", () => {
  T.__setMirrorState(state); const c = T.buildContextBlock();
  assert(/Biệt thự/.test(c) && /Hồ sơ/.test(c) && /THREADS/.test(c) && /NHÂN VẬT CÒN SỐNG CÓ LIÊN QUAN/.test(c), c.slice(0, 300));
});
t("buildMainWritePrompt (proseOnly) có đủ quy tắc của viết thường và không đòi TIÊU ĐỀ/NỘI DUNG", () => {
  T.__setMirrorState(state);
  const rb = T.buildRecentBlocks(state.chapters);
  const p = T.buildMainWritePrompt({ chapterNumber: 3, isRegen: false, regenIndex: 0, regenMode: "full", descPrompt: T.DESCRIPTION_PROMPTS.balanced, explicitPrompt: "", vocabBlock: "", usingNsfw: false,
    context: T.buildContextBlock(), lastChapterEnding: "…", recentFullText: rb.recentFullText, olderSummaries: rb.olderSummaries, plan: "", priorCount: 2, proseOnly: true });
  assert(/BỐ CỤC/.test(p) && /CHỐNG LẶP/.test(p) && /ĐỘ DÀI & TỰ DO SÁNG TÁC/.test(p) && /QUY TẮC BÁM BRIEF/.test(p) && /KẾ HOẠCH ĐỘ DÀI/.test(p));
  assert(!/TIÊU ĐỀ: <tên chương>/.test(p) && /CHỈ văn xuôi/.test(p));
});
console.log(pass + "/" + (pass + fail) + " PASS"); process.exit(fail ? 1 : 0);
