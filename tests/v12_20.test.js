// V12.20 — test: từ lỗi ghép, câu cuối bị cụt, chương bám gợi ý (không bịa thêm sau cú chốt)
const fs = require("fs"), vm = require("vm"), path = require("path"), assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "../netlify/functions/write-chapter-background.js"), "utf8");
const mod = { exports: {} };
const sandbox = { module: mod, exports: mod.exports, console, process, Buffer, setTimeout, clearTimeout, URL, AbortController, TextDecoder, TextEncoder,
  require: (n) => (n === "@netlify/blobs" ? { getStore() {}, connectLambda() {} } : require(n)), fetch: async () => { throw new Error("network disabled"); } };
vm.createContext(sandbox);
vm.runInContext(src + "\n;module.exports.__t={findStrayWords,locateWordSentences,acceptWordFix,endsCleanly,trimToLastSentence,extractClosingBeat,trimToWordLimit,generateOneChapter,chapterWordLimits};", sandbox);
const T = mod.exports.__t;
let pass = 0, fail = 0; const pending = [];
function t(name, fn) { const ok = () => { console.log("PASS " + name); pass++; }, bad = e => { console.log("FAIL " + name + " — " + e.message); fail++; };
  try { const r = fn(); if (r && r.then) { pending.push(r.then(ok, bad)); return; } ok(); } catch (e) { bad(e); } }

t("findStrayWords bắt từ CÓ DẤU bị ghép lỗi, không báo nhầm tiếng Việt thật", () => {
  const bad = Array.from(T.findStrayWords("Giọng mươititude, bọcampo, bănnton."));
  assert.deepStrictEqual(bad.sort(), ["bănnton", "bọcampo", "mươititude"].sort());
  const ok = Array.from(T.findStrayWords("Nguyễn Hằng nghiêng người, khuỷu tay chuyển nghiệp, quyết nguyệt, thương, thuở, giường, ngoằn ngoèo, uỵch, oằn, ngoáy, quán café."));
  assert.deepStrictEqual(ok, []);
});
t("trimToWordLimit cắt ở câu hoàn chỉnh dù đoạn dài hơn 180 từ", () => {
  const sent = "Anh bước đi chậm rãi qua hành lang dài và tối. ";
  const text = sent.repeat(60) + "Rồi anh dừng lại";
  const r = T.trimToWordLimit(text, 300);
  assert(r.trimmed && /[.!?…]$/.test(r.text), "phải kết thúc bằng dấu câu: " + r.text.slice(-30));
});
t("endsCleanly / trimToLastSentence", () => {
  assert.strictEqual(T.endsCleanly("Cô đi. Rồi cô"), false);
  assert.strictEqual(T.endsCleanly("Cô nói: “Đi thôi.”"), true);
  const r = T.trimToLastSentence("Câu một khá dài để đủ tỉ lệ giữ lại. Câu hai cũng vậy nè. Rồi cô", 0.5);
  assert(r.cut && r.text.endsWith("vậy nè."));
});
t("extractClosingBeat lấy đúng dòng cú chốt", () => {
  assert(/tắt đèn/.test(T.extractClosingBeat("Cô vào phòng.\nCú chốt cuối chương: cô viết dòng chữ rồi tắt đèn.")));
  assert.strictEqual(T.extractClosingBeat("Cô vào phòng, mở tủ."), "");
});
t("acceptWordFix: nhận câu sửa đúng, từ chối câu còn từ lỗi / bịa thêm", () => {
  const o = "Anh nhìn bọcampo rồi cười khẽ với cô.";
  assert(T.acceptWordFix(o, "Anh nhìn tập hồ sơ rồi cười khẽ với cô.", ["bọcampo"]));
  assert(!T.acceptWordFix(o, "Anh nhìn bọcampo rồi cười khẽ với cô.", ["bọcampo"]));
  assert(!T.acceptWordFix(o, "Một câu hoàn toàn khác không liên quan gì đến câu gốc ở trên.", ["bọcampo"]));
});

const words = (n, tag) => Array.from({ length: n }, (_, i) => `${tag}${i % 7}`).join(" ");
const para = (n) => { const out = []; for (let i = 0; out.join(" ").split(/\s+/).length < n; i++) out.push(`Buổi ${i} cô đi qua con phố số ${i * 7} và nghe tiếng gió thổi ${i % 5} lần.`); return out.join(" "); };
function job(extra) { return { apiEndpoint: "x", apiKey: "k", model: "m", storyState: Object.assign({ chapters: [], characters: [], directive: "", nextChapterHint: "", minChapterWords: 500, autoContinueMax: 4, chapterMatureFocus: "none" }, extra || {}) }; }

(async () => {
  // Có gợi ý: văn bản ngắn hơn mục tiêu nhưng KHÔNG được gọi "Viết TIẾP"
  let calls = []; sandbox.callWithRetry = async (a) => { const p = a.messages[a.messages.length - 1].content; calls.push(p); return { text: para(150), finishReason: "stop" }; };
  const c1 = await T.generateOneChapter(job({ nextChapterHint: "Cô vào phòng, mở tủ.\nCú chốt cuối chương: cô viết dòng chữ rồi tắt đèn." }));
  t("Có gợi ý + model tự dừng → KHÔNG tự viết tiếp để đủ số từ", () => {
    assert(!calls.some(p => /Viết TIẾP chương/.test(p)), "không được có lượt viết tiếp");
    assert(calls.filter(p => !/CHÈN THÊM DIỄN BIẾN/.test(p) && !/Lập KẾ HOẠCH cho CHƯƠNG/.test(p)).length === 1, "chỉ 1 lượt viết chính (không tính bước lập kế hoạch)");
    const _main = calls.find(p => /Bạn đang viết CHƯƠNG THỨ/.test(p)) || ""; assert(/CÚ CHỐT BẮT BUỘC/.test(_main) && /tắt đèn/.test(_main), "prompt phải khóa cú chốt ở cuối");
  });
  // V12.22: ĐÃ BỎ "chia đoạn làm dày". Có gợi ý + chương ngắn -> CHÈN diễn biến vào TRƯỚC đoạn kết, Ending Anchor giữ nguyên ở cuối.
  let _u = 0; const pw = (n) => { let x = ""; n = n + 1000; while (n > 0) { x += "bcdglmnpqrstvx"[n % 14] + "ảẹồưếịơ"[Math.floor(n / 14) % 7]; n = Math.floor(n / 70); } return x; };
  const uniq = (w) => { const out = []; let cnt = 0; while (cnt < w) { const sent = []; for (let i = 0; i < 12; i++) { sent.push(pw(++_u)); } out.push("Cô " + sent.join(" ") + "."); cnt += 13; } return out.join(" "); };
  const mk = (n, w) => Array.from({ length: n }, () => uniq(w)).join("\n\n");
  const ANCHOR = "Cô viết dòng chữ nhỏ rồi tắt đèn.";
  const hint = "Cô vào phòng.\nEnding Anchor: cô viết dòng chữ rồi tắt đèn.";
  calls = [];
  const shortOrig = mk(6, 60) + "\n\n" + ANCHOR;
  sandbox.callWithRetry = async (a) => { const p = a.messages[a.messages.length - 1].content; calls.push(p);
    if (/CHÈN THÊM DIỄN BIẾN/.test(p)) return { text: mk(3, 100) + " Gió lùa qua khe cửa.", finishReason: "stop" };
    return { text: shortOrig, finishReason: "stop" }; };
  const cx = await T.generateOneChapter(job({ nextChapterHint: hint }));
  t("Có gợi ý + chương ngắn → chèn thêm diễn biến trước đoạn kết, Ending Anchor vẫn ở cuối", () => {
    assert(calls.some(p => /CHÈN THÊM DIỄN BIẾN/.test(p)), "phải có lượt chèn");
    assert(!calls.some(p => /MỞ RỘNG ĐOẠN/.test(p)), "không còn bước mở rộng theo khối");
    assert(!calls.some(p => /Viết TIẾP chương/.test(p)), "không viết nối sau anchor");
    assert(cx.wordCount > 600, "dài hơn bản gốc: " + cx.wordCount);
    assert(cx.text.endsWith(ANCHOR), "anchor phải là câu cuối");
    assert(cx.text.split(ANCHOR).length === 2, "anchor chỉ xuất hiện một lần");
    assert(cx.autoUpdateIssues.some(x => /Đã chèn thêm/.test(x)));
    assert(calls.find(p => /CHÈN THÊM DIỄN BIẾN/.test(p)).includes("tắt đèn"), "prompt chèn phải mang Ending Anchor");
  });
  // Chương 2867 từ, mục tiêu 4500: chèn tối đa 2 lượt, đạt >=95% mục tiêu, không vượt hardMax, anchor ở cuối
  let insCalls = 0;
  const bigOrig = mk(40, 70) + "\n\n" + ANCHOR;
  sandbox.callWithRetry = async (a) => { const p = a.messages[a.messages.length - 1].content;
    if (/CHÈN THÊM DIỄN BIẾN/.test(p)) { insCalls++; return { text: mk(10, 160) + " Cô hít sâu một hơi.", finishReason: "stop" }; }
    return { text: bigOrig, finishReason: "stop" }; };
  const cb = await T.generateOneChapter(job({ minChapterWords: 4500, nextChapterHint: hint }));
  t("Chương ngắn so với mục tiêu 4500 → chèn ≤2 lượt, đạt >=95%, không vượt hardMax, giữ anchor", () => {
    assert(insCalls >= 1 && insCalls <= 2, "số lượt chèn: " + insCalls);
    assert(cb.wordCount >= 4275 && cb.wordCount <= T.chapterWordLimits({ minChapterWords: 4500 }).hardMax, "số từ: " + cb.wordCount);
    assert(cb.text.endsWith(ANCHOR));
  });
  // Phần chèn quá ngắn / lặp -> bị bỏ, bản gốc và anchor nguyên vẹn
  sandbox.callWithRetry = async (a) => { const p = a.messages[a.messages.length - 1].content;
    if (/CHÈN THÊM DIỄN BIẾN/.test(p)) return { text: uniq(20), finishReason: "stop" };
    return { text: shortOrig, finishReason: "stop" }; };
  const cy = await T.generateOneChapter(job({ nextChapterHint: hint }));
  t("Phần chèn quá ngắn/lặp → bị bỏ, giữ nguyên bản gốc và Ending Anchor", () => {
    assert(cy.text.endsWith(ANCHOR)); assert(cy.text === shortOrig.trim() || cy.text.split(/\s+/).length >= shortOrig.split(/\s+/).length - 2);
    assert(cy.autoUpdateIssues.some(x => /quá ngắn|lặp lại/.test(x)));
  });
  t("extractClosingBeat nhận cả 'Ending Anchor'", () => {
    assert(/tắt đèn/.test(T.extractClosingBeat("Cô vào phòng.\nEnding Anchor: cô viết dòng chữ rồi tắt đèn.")));
  });
  t("hardMax nới lên 1.4× mục tiêu (không cắt mất anchor khi AI viết dài hơn)", () => {
    assert.strictEqual(T.chapterWordLimits({ minChapterWords: 5000 }).hardMax, 7000);
  });
  sandbox.callWithRetry = async (a) => { const p = a.messages[a.messages.length - 1].content; calls.push(p); return { text: para(150), finishReason: "stop" }; };
  // Không gợi ý: vẫn viết tiếp như cũ
  calls = []; await T.generateOneChapter(job());
  t("Không gợi ý → vẫn viết tiếp đến đủ số từ như cũ", () => assert(calls.some(p => /Viết TIẾP chương/.test(p))));
  // Có gợi ý + bị cắt (length): được viết tiếp, và lệnh viết tiếp mang theo gợi ý + cú chốt
  calls = []; let n = 0;
  sandbox.callWithRetry = async (a) => { const p = a.messages[a.messages.length - 1].content; calls.push(p); if (/Lập KẾ HOẠCH cho CHƯƠNG/.test(p)) return { text: "Kế hoạch ngắn.", finishReason: "stop" }; n++; return n === 1 ? { text: para(150), finishReason: "length" } : { text: para(400) + " Cô viết dòng chữ rồi tắt đèn.", finishReason: "stop" }; };
  await T.generateOneChapter(job({ nextChapterHint: "Cô vào phòng.\nCú chốt cuối chương: cô viết dòng chữ rồi tắt đèn." }));
  t("Có gợi ý + bị cắt giữa chừng → viết tiếp kèm gợi ý và cú chốt", () => {
    const cont = calls.find(p => /Viết TIẾP chương/.test(p)); assert(cont, "phải có lượt viết tiếp");
    assert(/KẾ HOẠCH CỦA NGƯỜI DÙNG/.test(cont) && /CÚ CHỐT CUỐI CHƯƠNG/.test(cont));
  });
  // Câu cuối cụt → AI khép chương
  calls = []; n = 0;
  sandbox.callWithRetry = async (a) => { const p = a.messages[a.messages.length - 1].content; calls.push(p); n++;
    if (/bị CỤT giữa câu/.test(p)) return { text: "mím môi rồi tắt đèn.", finishReason: "stop" };
    return { text: para(150) + " Cô kéo tập da đen ra, viết thêm một dòng chữ nhỏ. Rồi cô", finishReason: "stop" }; };
  const c4 = await T.generateOneChapter(job({ nextChapterHint: "Cô viết chữ." }));
  t("Câu cuối bị cụt → được khép bằng câu hoàn chỉnh", () => { assert(/Rồi cô mím môi rồi tắt đèn\.$/.test(c4.text), c4.text.slice(-60)); assert(c4.autoUpdateIssues.some(x => /bị cụt/.test(x))); });
  // Cụt và AI khép lỗi → lùi về câu hoàn chỉnh
  sandbox.callWithRetry = async (a) => { const p = a.messages[a.messages.length - 1].content; if (/bị CỤT giữa câu/.test(p)) throw new Error("lỗi mạng"); return { text: para(150) + " Rồi cô", finishReason: "stop" }; };
  const c5 = await T.generateOneChapter(job({ nextChapterHint: "Cô viết chữ." }));
  t("Cụt và AI khép thất bại → lùi về câu hoàn chỉnh gần nhất", () => assert(/[.!?…]$/.test(c5.text) && !/Rồi cô$/.test(c5.text)));
  // Tự sửa từ lỗi
  sandbox.callWithRetry = async (a) => { const p = a.messages[a.messages.length - 1].content;
    if (/LỖI SINH CHỮ/.test(p)) return { text: "1|Anh nhìn tập hồ sơ rồi cười khẽ với cô.", finishReason: "stop" };
    return { text: para(150) + " Anh nhìn bọcampo rồi cười khẽ với cô. Cửa đóng lại.", finishReason: "stop" }; };
  const c6 = await T.generateOneChapter(job({ nextChapterHint: "Anh cười." }));
  t("Từ lỗi 'bọcampo' được AI sửa tại chỗ, phần còn lại giữ nguyên", () => { assert(!/bọcampo/.test(c6.text)); assert(/Anh nhìn tập hồ sơ rồi cười khẽ với cô\./.test(c6.text)); assert(c6.autoUpdateIssues.some(x => /tự sửa 1 từ lỗi/.test(x))); });
  await Promise.all(pending);
  console.log(`\n${pass}/${pass + fail} PASS`); process.exit(fail ? 1 : 0);
})();
