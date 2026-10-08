// V12.22b — chống chương bị viết lại 2 lần (bản 2 chỉ diễn đạt lại), nhãn TIÊU ĐỀ/NỘI DUNG dính giữa văn bản
const fs = require("fs"), vm = require("vm"), path = require("path"), assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "../shared/core.js"), "utf8");
const sb = { console }; vm.createContext(sb);
vm.runInContext(src + "\n;this.__t={dedupeRepeatedScene,dropRestartedContinuation,splitByInnerLabels,countWords};", sb);
const T = sb.__t; const F = require("./fixtures/dup_chapter.js");
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); console.log("PASS " + name); pass++; } catch (e) { console.log("FAIL " + name + " — " + e.message); fail++; } }
const wc = T.countWords;

t("Chương lặp có nhãn TIÊU ĐỀ/NỘI DUNG dính liền → chỉ còn bản 1", () => {
  const out = T.dedupeRepeatedScene(F.glued);
  assert(!/TIÊU ĐỀ|NỘI DUNG/.test(out), "còn nhãn");
  assert(!/Xe vừa dừng trước sảnh/.test(out), "còn bản 2");
  assert(/^Chiếc xe nhả một tiếng máy trầm/.test(out)); assert(/nứng lồn\.$/.test(out));
  assert(Math.abs(wc(out) - wc(F.single)) < 8, wc(out) + " vs " + wc(F.single));
});
t("Chương lặp KHÔNG có nhãn (bản 2 chỉ diễn đạt lại) → vẫn cắt bản 2", () => {
  const out = T.dedupeRepeatedScene(F.noLabel);
  assert(!/Xe vừa dừng trước sảnh/.test(out), "còn mở đầu bản 2");
  assert(Math.abs(wc(out) - wc(F.single)) < 40, wc(out) + " vs " + wc(F.single));
  assert(/nứng lồn\.$/.test(out));
});
t("Chương bình thường (1 bản) → giữ nguyên, không cắt nhầm", () => {
  assert.strictEqual(T.dedupeRepeatedScene(F.single), F.single);
});
t("Bản 1 bị cụt, bản 2 đầy đủ → giữ bản 2", () => {
  const cut = F.copy1.slice(0, 16).join("\n\n").replace(/[.”]$/, "") + " rồi cô";
  const out = T.dedupeRepeatedScene(cut + "TIÊU ĐỀ: Hạn Chót\n\nNỘI DUNG:\n\n" + F.copy2.join("\n\n"));
  assert(/^Xe vừa dừng trước sảnh/.test(out), out.slice(0, 40)); assert(/nứng lồn\.$/.test(out));
});
t("Nhãn thừa nhưng nội dung KHÔNG lặp → bỏ nhãn, giữ cả hai phần", () => {
  const more = ["Sáng hôm sau, ông Thành tới văn phòng từ rất sớm, mang theo một chiếc cặp da màu nâu cũ và nụ cười khó đoán.", "Hai người ngồi đối diện nhau bên chiếc bàn họp dài, chủ tịch rót trà, mùi hoa nhài lan ra khắp căn phòng yên tĩnh.", "Cuộc đàm phán kéo dài suốt buổi sáng, từng điều khoản về cổ phần được đem ra bàn bạc kỹ lưỡng từng dòng một.", "Đến trưa, bản hợp đồng cuối cùng vẫn chưa được ký, và bầu không khí trong phòng bắt đầu trở nên căng thẳng hơn."];
  const out = T.dedupeRepeatedScene(F.single + "\n\nNỘI DUNG:\n\n" + more.join("\n\n"));
  assert(!/NỘI DUNG/.test(out)); assert(/ông Thành tới văn phòng/.test(out)); assert(/Chiếc xe nhả/.test(out));
});
t("Đoạn viết tiếp diễn đạt lại nội dung đã có → bị bỏ (dropRestartedContinuation)", () => {
  const out = T.dropRestartedContinuation(F.single, F.copy2.join("\n\n"));
  assert(wc(out) < 60, "còn " + wc(out) + " từ");
});
t("Đoạn viết tiếp mở đầu bằng nhãn, nội dung mới → bỏ nhãn, giữ nội dung", () => {
  const nw = "Sáng hôm sau, ông Thành tới văn phòng từ rất sớm, mang theo một chiếc cặp da màu nâu cũ và nụ cười khó đoán.\n\nHai người ngồi đối diện nhau bên chiếc bàn họp dài, chủ tịch rót trà, mùi hoa nhài lan ra khắp căn phòng yên tĩnh.\n\nCuộc đàm phán kéo dài suốt buổi sáng, từng điều khoản về cổ phần được đem ra bàn bạc kỹ lưỡng.";
  const out = T.dropRestartedContinuation(F.single, "TIÊU ĐỀ: Gì đó\n\nNỘI DUNG:\n\n" + nw);
  assert(!/NỘI DUNG|TIÊU ĐỀ/.test(out)); assert(/ông Thành tới văn phòng/.test(out));
});
t("Đoạn viết tiếp bình thường → giữ nguyên", () => {
  const nw = "Sáng hôm sau, ông Thành tới văn phòng từ rất sớm, mang theo một chiếc cặp da màu nâu cũ và nụ cười khó đoán.\n\nHai người ngồi đối diện nhau bên chiếc bàn họp dài, chủ tịch rót trà, mùi hoa nhài lan ra khắp căn phòng yên tĩnh.\n\nCuộc đàm phán kéo dài suốt buổi sáng, từng điều khoản về cổ phần được đem ra bàn bạc kỹ lưỡng.";
  assert.strictEqual(T.dropRestartedContinuation(F.single, nw), nw);
});
console.log(`\n${pass}/${pass + fail} PASS`); process.exit(fail ? 1 : 0);
