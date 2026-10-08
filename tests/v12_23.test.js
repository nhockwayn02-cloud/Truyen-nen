// V12.23 — KẾ HOẠCH ĐỘ DÀI, MỞ RỘNG CUỐI, quy tắc chấp nhận bản mở rộng
const fs = require("fs"), vm = require("vm"), path = require("path"), assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "../shared/core.js"), "utf8");
const sb = { console }; vm.createContext(sb);
vm.runInContext(src + "\n;this.__t={buildLengthPlan,buildExpandPrompt,acceptExpandedChapter,countWords,removeEnglishLeaks,removeEnglishLeaksDetailed,stripForeign};", sb);
const T = sb.__t; let pass = 0, fail = 0;
function t(name, fn) { try { fn(); console.log("PASS " + name); pass++; } catch (e) { console.log("FAIL " + name + " — " + e.message); fail++; } }
const words = n => Array.from({ length: n }, (_, i) => "từ" + (i % 7)).join(" ") + ".";

t("Kế hoạch độ dài: gợi ý nhiều nhịp -> chia ngân sách, tổng ≈ 105% mục tiêu", () => {
  const hint = Array.from({ length: 6 }, (_, i) => "Nhịp số " + (i + 1) + " nhân vật làm một việc nào đó khá dài.").join("\n");
  const out = T.buildLengthPlan(hint, 5000);
  assert(/KẾ HOẠCH ĐỘ DÀI/.test(out)); assert(/6 phần/.test(out)); assert(/5250/.test(out));
});
t("Kế hoạch độ dài: gợi ý rỗng/1 nhịp -> rỗng", () => { assert.strictEqual(T.buildLengthPlan("", 5000), ""); assert.strictEqual(T.buildLengthPlan("Ngắn quá.", 5000), ""); });
t("Prompt mở rộng chứa số từ hiện tại, mục tiêu, giới hạn, bản gốc", () => {
  const p = T.buildExpandPrompt({ text: "NOI DUNG GOC", wc: 4200, goal: 4750, target: 5000, maxWords: 7000, hint: "g", closing: "kết" });
  assert(/4200 từ/.test(p) && /4750/.test(p) && /7000/.test(p) && /NOI DUNG GOC/.test(p) && /ENDING ANCHOR: kết/.test(p));
});
t("Chấp nhận bản mở rộng dài hơn đáng kể", () => {
  const r = T.acceptExpandedChapter(words(4000), "NỘI DUNG: " + words(4900), 7000);
  assert(r.ok && r.words > 4800);
});
t("Từ chối bản mở rộng không dài hơn / ngắn hơn / rỗng", () => {
  assert(!T.acceptExpandedChapter(words(4000), words(4050), 7000).ok);
  assert(!T.acceptExpandedChapter(words(4000), words(3000), 7000).ok);
  assert(!T.acceptExpandedChapter(words(4000), "", 7000).ok);
});
t("Bản mở rộng vượt giới hạn tối đa bị cắt", () => {
  const r = T.acceptExpandedChapter(words(4000), words(9000), 7000);
  assert(r.ok && r.words <= 7000 && r.trimmed);
});
t("Xóa câu tiếng Anh lẫn giữa đoạn văn Việt, giữ nguyên phần Việt", () => {
  const vi1 = "Mỹ Duyên siết chặt tập hồ sơ trong tay, ánh mắt thoáng lạnh đi khi nhìn về phía cửa kính.";
  const en = "The user wants me to write the bridge section in Vietnamese and this leaked into the output.";
  const r = T.removeEnglishLeaksDetailed(vi1 + " " + en + " Cô bước nhanh về phía thang máy.");
  assert(!/user wants/.test(r.text) && r.text.includes("siết chặt") && r.text.includes("thang máy") && r.removed.length === 1);
});
t("Xóa nguyên đoạn tiếng Anh, giữ đoạn Việt xung quanh", () => {
  const txt = "Hắn đứng im nhìn cô rất lâu.\n\nLet me write the next section now, the user should see this chapter text and not the notes.\n\nCô quay đi, không nói gì.";
  const out = T.stripForeign(txt);
  assert(!/Let me/.test(out) && out.includes("Hắn đứng im") && out.includes("Cô quay đi"));
});
t("Không xóa văn Việt, lời thoại ngắn hay từ mượn", () => {
  const txt = "“OK, được rồi.” Hắn gật đầu, lấy điện thoại gọi taxi ra đón cô trước cổng công ty.\nCô to lớn hơn hắn nghĩ, nhưng bước đi vẫn nhẹ như mèo.";
  assert.strictEqual(T.removeEnglishLeaks(txt), txt);
});
console.log(pass + "/" + (pass + fail) + " PASS"); process.exit(fail ? 1 : 0);
