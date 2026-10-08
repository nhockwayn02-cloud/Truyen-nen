// Test đơn vị cho worker — chạy: node tests/worker.test.js  (không cần mạng / @netlify/blobs thật)
const fs = require("fs"), vm = require("vm"), path = require("path");
const assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "../netlify/functions/write-chapter-background.js"), "utf8");
const mod = { exports: {} };
const sandbox = {
  module: mod, exports: mod.exports, console, process, Buffer, setTimeout, clearTimeout, URL, AbortController, TextDecoder, TextEncoder,
  require: (n) => (n === "@netlify/blobs" ? { getStore() {}, connectLambda() {} } : require(n)),
  fetch: async () => { throw new Error("network disabled in test"); },
};
vm.createContext(sandbox);
vm.runInContext(src + "\n;module.exports.__t={evidenceInText,mergeCharacter,formatParagraphs,dedupeRepeatedScene,dropRestartedContinuation,findStrayWords,ageGuardPrompt,underageNames,parseAgeNum,parseArray,parseObjectDetailed,repairTruncatedArray,runPool,textHasNsfwKeyword,trimToWordLimit,runWorkerQualityGate,rewriteWorkerDraft,qualityReviewWorker};", sandbox);
const T = mod.exports.__t;
let pass = 0, fail = 0;
const pending = [];
function t(name, fn) { try { const r = fn(); if (r && r.then) { pending.push(r.then(() => { console.log("PASS " + name); pass++; }, e => { console.log("FAIL " + name + " — " + e.message); fail++; })); return; } console.log("PASS " + name); pass++; } catch (e) { console.log("FAIL " + name + " — " + e.message); fail++; } }

t("handler được export", () => assert.strictEqual(typeof mod.exports.handler, "function"));
t("parseAgeNum", () => { assert.strictEqual(T.parseAgeNum("16 tuổi"), 16); assert.strictEqual(T.parseAgeNum("không rõ"), null); assert.strictEqual(T.parseAgeNum(1000), 1000); });
t("underageNames bắt <18, bỏ qua ≥18/không rõ", () => {
  const s = { mainCharProfile: { name: "An", age: "25" }, characters: [{ name: "Bo", age: "16" }, { name: "Cy", age: "18" }, { name: "Di", age: "?" }, { name: "Em", age: "17 tuổi" }] };
  assert.deepStrictEqual(Array.from(T.underageNames(s)), ["Bo", "Em"]);
});
t("underageNames bắt cả nhân vật chính <18", () => assert.deepStrictEqual(Array.from(T.underageNames({ mainCharProfile: { name: "Lan", age: 15 } })), ["Lan"]));
t("ageGuardPrompt có rào chắn + liệt kê tên", () => { const p = T.ageGuardPrompt({ characters: [{ name: "Bo", age: "16" }] }); assert(p.includes("RÀO CHẮN TUỔI") && p.includes("Bo")); });
t("ageGuardPrompt không liệt kê khi không có ai <18", () => assert(!T.ageGuardPrompt({ characters: [{ name: "Cy", age: "30" }] }).includes("KHÔNG được xuất hiện")));
t("repairTruncatedArray cứu đúng các object hoàn chỉnh", () => {
  const r = T.repairTruncatedArray('[{"name":"A","tier":"major"},{"name":"B","tier":"minor"},{"name":"C","ti');
  assert.deepStrictEqual(Array.from(r.items).map(x => x.name), ["A", "B"]);
});
t("parseArray đọc mảng bọc trong markdown", () => { const r = T.parseArray('```json\n[{"a":1},{"a":2}]\n```'); assert(r.valid && r.items.length === 2 && !r.truncated); });
t("parseArray: [] hợp lệ là thành công, không phải lỗi", () => { const r = T.parseArray("[]"); assert(r.valid === true || r.items.length === 0); });
t("parseArray cứu mảng bị cắt giữa chừng", () => { const r = T.parseArray('[{"name":"A"},{"name":"B"},{"name":"C'); assert(r.items.length >= 2 && r.truncated); });
t("parseArray xử lý rác không ném lỗi", () => { const r = T.parseArray("xin lỗi tôi không thể"); assert(r.valid === false && r.items.length === 0); });

t("runPool: mỗi lô chạy đúng 1 lần, không vượt giới hạn song song", () => {
  let cur = 0, max = 0; const seen = [];
  return T.runPool(9, async (i) => { cur++; max = Math.max(max, cur); seen.push(i); await new Promise(r => setTimeout(r, 15)); cur--; }, 3).then(() => {
    assert.deepStrictEqual(seen.slice().sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8]); assert(max <= 3 && max >= 2, "max=" + max);
  });
});
// ---- V12.14: hồi quy từ khóa 18+ (khớp theo từ, không khớp chuỗi con) ----
t("từ khóa 18+: không nhận nhầm câu bình thường", () => {
  ["Anh uống cà phê, cầm cây bút ký hợp đồng.", "Cô phản kháng dữ dội.", "Hai công ty có quan hệ đối tác.", "Sếp phê duyệt, thúc giục mọi người.", "Lần đầu anh đến Mông Cổ, đầu óc mông lung.", "Anh nhận cây búa và búp bê.", "Ông ôm ngực vì đau tim."]
    .forEach(x => assert.strictEqual(T.textHasNsfwKeyword(x), false, x));
});
t("từ khóa 18+: vẫn bắt đúng tín hiệu 18+", () => {
  ["Đêm tân hôn, họ ân ái đến sáng.", "Cô rên rỉ khi anh hôn cổ cô.", "Viết cảnh 18+ thật nóng.", "Anh cởi áo cô, vuốt ve.", "Họ quan hệ tình dục.", "Cảnh nóng chương này."]
    .forEach(x => assert.strictEqual(T.textHasNsfwKeyword(x), true, x));
});
t("trimToWordLimit giữ nguyên xuống dòng/đoạn văn khi cắt", () => {
  const text = Array.from({ length: 40 }, (_, i) => `— Câu thoại số ${i} của nhân vật, anh ta nói rất chậm rãi.\n\nCô lặng im một lúc rồi đáp lại.`).join("\n\n");
  const r = T.trimToWordLimit(text, 200);
  assert.strictEqual(r.trimmed, true);
  assert((r.text.match(/\n\n/g) || []).length >= 5, "mất đoạn văn");
  assert(/[.!?…”"]$/.test(r.text), "phải kết thúc ở cuối câu");
});

t("formatParagraphs ngắt khối văn đặc + tách thoại + idempotent", () => {
  const blk = "Cô ngồi gập người lại, hai cánh tay ôm lấy bụng dưới. Nó là một sự hiện diện sống động, nóng rát. Mỗi lần cô hít thở sâu, cơ bụng co lại, nó lại cọ xát vào thành ruột. Còn chiếc lá thép siết quanh người cô. Đó là một sự trừng phạt tĩnh lặng. Nó không run. Nó không cử động. Cô liếm môi, nếm được vị mặn của mồ hôi. “Anh đến rồi à?” Cô hỏi khẽ. “Ừ.” Hắn đáp, giọng lạnh. — Đứng lên. Cô run rẩy đứng dậy, hai đầu gối chạm vào nhau, không thể đứng vững nổi nữa.";
  const r = T.formatParagraphs(blk);
  assert((r.match(/\n\n/g) || []).length >= 5, "chưa ngắt đủ đoạn");
  assert(r.split("\n\n").some(p => p.startsWith("“Anh đến rồi à?”")), "thoại phải ở đoạn riêng");
  assert(r.split("\n\n").some(p => p.startsWith("— Đứng lên.")), "thoại gạch đầu dòng phải ở đoạn riêng");
  assert.strictEqual(r.replace(/\s+/g, " "), blk.replace(/\s+/g, " "), "không được đổi/mất chữ");
  assert.strictEqual(T.formatParagraphs(r), r, "chạy 2 lần phải ổn định");
  assert.strictEqual(T.formatParagraphs("Ngắn.\n\nHai."), "Ngắn.\n\nHai.");
});

t("dedupeRepeatedScene cắt bản viết lặp từ đầu (kể cả dính liền), giữ nguyên chương không lặp", () => {
  const W = "anh cô hắn nhà phố xe mưa đèn cửa bàn ghế tay mắt gió đêm sáng nước áo giày thư khóa tiền lời tiếng bước tường sàn trần gương ly bát đũa".split(" ");
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const para = () => { const a = []; for (let k = 0; k < 40; k++) a.push(W[Math.floor(rnd() * W.length)] + (k % 7 === 0 ? " và" : "")); return a.join(" ") + "."; };
  const open = ["Mười tám giờ năm mươi tám phút. Con trỏ trên màn hình nhấp nháy bên cạnh nút gửi, trắng dã, vô tri, như một cái hố đang chờ nuốt chửng thứ cô sắp ném xuống đó.", "Vũ Hà Anh ngồi thẳng lưng, nhưng lưng cô đã đổ mồ hôi, dính chặt vào ghế xoay da, trang giấy chỉ dài đúng một trang.", "Cô đọc lại những dòng chữ mình vừa gõ. Nó đúng. Nó chính xác đến từng chi tiết nhỏ nhất về người phụ nữ mà tám năm qua chưa bao giờ bỏ mặc cô.", "Cô hít một hơi sâu, cơn đau quặn từ bụng dưới lan lên, hòa vào cơn buồn tiểu vẫn chưa được giải tỏa từ buổi trưa.", "Tiếng chuông thông báo của máy tính kêu lên một tiếng khô khốc, thư bay qua những dây cáp ngầm dưới lòng thành phố."];
  const rewrite = ["Mười tám giờ năm mươi tám phút. Con trỏ nhấp nháy cạnh nút gửi, trắng dã, vô tri, như một cái hố chờ nuốt thứ cô sắp ném xuống.", "Vũ Hà Anh ngồi thẳng lưng, nhưng tấm lưng đã ướt đẫm mồ hôi, dính chặt vào ghế da, trang giấy chỉ dài đúng một trang.", "Cô đọc lại những dòng mình vừa gõ. Đúng. Chính xác đến từng chi tiết nhỏ về người phụ nữ tám năm qua chưa bao giờ bỏ mặc cô.", "Cô hít một hơi sâu, cơn đau quặn từ bụng dưới lan lên, hòa vào cơn buồn tiểu chưa được giải tỏa từ buổi trưa."];
  const full = [...open]; for (let i = 0; i < 12; i++) full.push(para());
  const base = full.join("\n\n");
  assert.strictEqual(T.dedupeRepeatedScene(base), base, "không được đụng chương không lặp");
  assert.strictEqual(T.dedupeRepeatedScene(base + "\n\n" + rewrite.join("\n\n")), base, "phải cắt bản lặp");
  assert.strictEqual(T.dedupeRepeatedScene(base + rewrite.join("\n\n")), base, "phải cắt cả khi dính liền không dòng trống");
  assert.strictEqual(T.dropRestartedContinuation(base, rewrite.join("\n\n")), "", "lượt viết tiếp chép lại phải bị bỏ");
  const fresh = "Hắn bước ra khỏi phòng và khép cửa lại thật khẽ, để mặc cô ngồi đó giữa căn phòng tối, nghe tiếng bước chân xa dần ngoài hành lang.";
  assert.strictEqual(T.dropRestartedContinuation(base, fresh), fresh, "phần viết tiếp mới phải được giữ");
});
t("findStrayWords bắt từ Latinh lạ, bỏ qua tiếng Việt không dấu và từ mượn thường gặp", () => {
  const r = Array.from(T.findStrayWords("nụ cười chua cant HttpServletResponse, son czerwony, cô iqaluit đáp, mùi Nebraska, nhìn sedan until khuất bóng. Nguyễn Trãi, Hoàng Minh, khuya nhanh trong nghiêng quyền thuốc chung thanh Quỳnh Trang"));
  for (const w of ["HttpServletResponse", "czerwony", "iqaluit", "Nebraska", "until"]) assert(r.includes(w), "thiếu " + w);
  for (const w of ["sedan", "nghiêng", "Nguyễn", "chung", "thanh", "trong", "Quỳnh", "silicon", "latex"]) assert(!r.includes(w), "báo nhầm " + w);
  const r2 = Array.from(T.findStrayWords("dương vật giả silicon, TEMP, afternoon, thanharker, Somewhere, ralf, faint, Clear"));
  for (const w of ["afternoon", "thanharker", "Somewhere", "ralf", "faint", "Clear"]) assert(r2.includes(w), "thiếu " + w);
  assert(!r2.includes("silicon") && !r2.includes("TEMP"), "silicon/TEMP là từ mượn hợp lệ");
});

t("V12.19 findStrayWords không báo nhầm tiếng cười/hét/tượng thanh", () => {
  const r = Array.from(T.findStrayWords("Aaaaa! hahaha, hihi, hehe, huhuhu, kekeke, ahaha, hmmm, shhh, psst, ahhh, ooooh, Aaaaaa, choang, boong"));
  assert.deepStrictEqual(r, [], "báo nhầm: " + r.join(","));
  const r2 = Array.from(T.findStrayWords("afternoon, Somewhere, faint, hike, hake, until"));
  for (const w of ["afternoon", "Somewhere", "faint", "hike", "hake", "until"]) assert(r2.includes(w), "thiếu " + w);
});

t("V12.19 nghề/chức vụ không bị AI tự đổi (thư ký -> giám đốc) nếu không có bằng chứng trích từ chương", () => {
  const mk = () => ({ characters: [{ name: "Lan", role: "thư ký", occupation: "thư ký", coreLocked: false, tier: "supporting", relationships: [], history: [] }] });
  const text = "Lan gõ cửa phòng giám đốc, đặt tập hồ sơ lên bàn rồi lui ra.";
  let st = mk(); T.mergeCharacter(st, { name: "Lan", occupation: "giám đốc" }, 5, text);
  assert.strictEqual(st.characters[0].occupation, "thư ký", "không có bằng chứng thì giữ nguyên (kể cả NV mở khóa)");
  st = mk(); T.mergeCharacter(st, { name: "Lan", occupation: "giám đốc", explicitCoreChange: true, changeEvidence: "Hội đồng quản trị bổ nhiệm Lan làm giám đốc" }, 5, text);
  assert.strictEqual(st.characters[0].occupation, "thư ký", "bằng chứng không có trong chương thì bị bỏ");
  const text2 = "Sáng nay hội đồng quản trị bổ nhiệm Lan làm giám đốc chi nhánh.";
  st = mk(); T.mergeCharacter(st, { name: "Lan", occupation: "giám đốc", explicitCoreChange: true, changeEvidence: "hội đồng quản trị bổ nhiệm Lan làm giám đốc" }, 5, text2);
  assert.strictEqual(st.characters[0].occupation, "giám đốc", "có sự kiện thật + trích đúng thì được đổi");
});

t("V12.19 hồ sơ khóa vẫn điền được trường còn TRỐNG (giới tính, tuổi, nghề) nhưng không ghi đè trường đã có", () => {
  const st = { characters: [{ name: "Lan", gender: "", age: "", occupation: "", appearance: "tóc dài", coreLocked: true, tier: "supporting", relationships: [], history: [] }] };
  T.mergeCharacter(st, { name: "Lan", gender: "nữ", age: "27", occupation: "thư ký", appearance: "tóc ngắn", hair: "đen dài" }, 3, "Lan, nữ thư ký 27 tuổi");
  const c = st.characters[0];
  assert.strictEqual(c.gender, "nữ"); assert.strictEqual(c.age, "27"); assert.strictEqual(c.occupation, "thư ký");
  assert.strictEqual(c.appearance, "tóc dài", "appearance đã có + đang khóa thì không bị ghi đè");
  T.mergeCharacter(st, { name: "Lan", gender: "nam", age: "40" }, 4, "x");
  assert.strictEqual(c.gender, "nữ", "đã có thì không đổi"); assert.strictEqual(c.age, "27");
});

t("V12.19 các trường tuyến riêng / điểm mạnh / cách nói / 18+ được cập nhật; NV dưới 18 không ghi trường 18+", () => {
  const st = { characters: [
    { name: "Lan", age: "27", coreLocked: true, tier: "supporting", relationships: [], history: [], independentPlot: "", strength: "", speech: "" },
    { name: "Bé", age: "15", coreLocked: true, tier: "supporting", relationships: [], history: [] } ] };
  T.mergeCharacter(st, { name: "Lan", independentPlot: "bí mật sao chép hồ sơ công ty", strength: "ghi nhớ tốt", speech: "hay nói nhỏ nhẹ, cuối câu thêm 'ạ'", boundaries: "không làm chuyện ở công ty", attractionToMC: "bị cuốn hút" }, 6, "x");
  const l = st.characters[0];
  assert(l.independentPlot.includes("sao chép") && l.strength && l.speech && l.boundaries && l.attractionToMC, "thiếu cập nhật");
  T.mergeCharacter(st, { name: "Lan", independentPlot: "bí mật sao chép hồ sơ công ty; bị sếp nghi ngờ" }, 7, "x");
  assert(l.independentPlot.includes("nghi ngờ") && l.independentPlot.includes("sao chép"), "tuyến riêng phải cộng dồn");
  T.mergeCharacter(st, { name: "Bé", boundaries: "x", independentPlot: "đi học thêm" }, 6, "x");
  assert(!st.characters[1].boundaries, "dưới 18 không ghi trường 18+"); assert(st.characters[1].independentPlot, "trường thường vẫn ghi");
});

t("V12.19 quan hệ: đủ các trường (attraction, boundaries...) + quan hệ với NV chính ở bản chạy nền; dưới 18 bỏ trường 18+", () => {
  const st = { characters: [{ name: "Lan", age: "27", coreLocked: true, tier: "supporting", relationships: [], history: [] }, { name: "Bé", age: "16", coreLocked: true, tier: "supporting", relationships: [], history: [] }] };
  T.mergeCharacter(st, { name: "Lan", relationshipWithMain: { trust: "tăng", attraction: "bị cuốn hút", boundaries: "không ở công ty" }, relationships: [{ withName: "Mai", suspicion: "nghi ngờ", respect: "nể" }] }, 4, "x");
  const l = st.characters[0];
  const rm = l.relationships.find(r => /nh/i.test(r.withName));
  assert(rm && rm.attraction && rm.boundaries && rm.trust, "thiếu quan hệ với NV chính");
  const rmai = l.relationships.find(r => r.withName === "Mai"); assert(rmai.suspicion && rmai.respect, "thiếu trường quan hệ");
  T.mergeCharacter(st, { name: "Bé", relationshipWithMain: { trust: "ok", attraction: "x", boundaries: "y" } }, 4, "x");
  const rb = st.characters[1].relationships[0]; assert(rb.trust && !rb.attraction && !rb.boundaries, "dưới 18 không ghi attraction/boundaries");
});

t("V12.19 từ mượn thường gặp (vest, sofa, mascara, Chanel, Lelo, vecni) không bị báo lạ; please/Splat vẫn bị báo", () => {
  const r = Array.from(T.findStrayWords("vest, Chanel, sofa, mascara, vecni, Lelo, Splat, please"));
  assert.deepStrictEqual(r, ["Splat", "please"], r.join(","));
});

t("V12.15 rà soát: tách thoại trong đoạn ngắn, không cắt nhầm refrain giữa chương, tên nhân vật không bị báo lạ", () => {
  const short = '"Anh đến rồi. Vào đi." Cô mở cửa. "Em đợi lâu chưa?" "Không." Hắn bước vào và đặt chìa khóa xuống bàn thật khẽ khàng.';
  const r = T.formatParagraphs(short);
  assert(r.split("\n\n").length >= 4, "thoại trong đoạn ngắn phải được tách");
  assert.strictEqual(r.replace(/\s+/g, " "), short.replace(/\s+/g, " "), "không được mất chữ");
  const W = "anh cô hắn nhà phố xe mưa đèn cửa bàn ghế tay mắt gió đêm sáng nước áo giày thư khóa tiền lời tiếng bước tường sàn trần gương ly bát đũa".split(" ");
  let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const para = () => { const a = []; for (let k = 0; k < 40; k++) a.push(W[Math.floor(rnd() * W.length)] + (k % 6 === 0 ? " và" : "")); return a.join(" ") + "."; };
  const refrain = "Trời vẫn mưa mãi không ngừng, và cô vẫn ngồi đó chờ đợi trong căn phòng lạnh lẽo, nghe tiếng nước nhỏ giọt từ mái hiên.";
  const chap = []; for (let i = 0; i < 6; i++) chap.push(para()); chap.push(refrain); for (let i = 0; i < 4; i++) chap.push(para()); chap.push(refrain); chap.push(para());
  const txt = chap.join("\n\n");
  assert.strictEqual(T.dedupeRepeatedScene(txt), txt, "câu lặp có chủ ý giữa chương không được bị cắt");
  const st = Array.from(T.findStrayWords("Hana bước vào phòng của Kaito rất khẽ.", ["Hana Nguyễn", "Kaito"]));
  assert.strictEqual(st.length, 0, "tên nhân vật khai báo không được báo lạ: " + st.join(","));
  assert(Array.from(T.findStrayWords("Hana bước vào phòng.")).includes("Hana"), "không khai báo thì vẫn báo");
});

/* ===== V12.16b: Quality Gate (worker) — callWithRetry được giả lập, không cần mạng ===== */
/* các test Gate dùng chung sandbox.callWithRetry giả lập → phải chạy TUẦN TỰ (chạy chồng sẽ ghi đè lẫn nhau) */
let gateChain = Promise.resolve();
function tg(name, fn) {
  const p = gateChain.then(() => fn()).then(() => { console.log("PASS " + name); pass++; }, e => { console.log("FAIL " + name + " — " + e.message); fail++; });
  gateChain = p; pending.push(p);
}
function gateJob(extra) {
  return { apiEndpoint: "x", apiKey: "k", model: "m", storyState: Object.assign({ chapters: [], characters: [], directive: "", nextChapterHint: "", qualityPassScore: 90, qualitySoftFailScore: 75, qualityMaxAttempts: 3 }, extra || {}) };
}
/* văn bản giả nhiều câu KHÁC NHAU (tránh bị dedupeRepeatedScene coi là lặp); ~n từ */
const longText = (w, n) => { const out = []; for (let i = 0; out.join(" ").split(/\s+/).length < n; i++) out.push(`Buổi ${i} ${w} đi qua con phố số ${i * 7} và nghe tiếng gió thổi ${i % 5} lần.`); const ps = []; for (let i = 0; i < out.length; i += 3) ps.push(out.slice(i, i + 3).join(" ")); return ps.join("\n\n"); };
function review(o) { return JSON.stringify(Object.assign({ score: 95, verdict: "PASS", dimensions: {}, mainEventCount: 1, namedCharacterCount: 1, unauthorizedImportantCharacter: false, knowledgeViolation: false, retcon: false, hardFailures: [], warnings: [], suggestions: [], rewriteInstructions: ["sửa cảnh 2"] }, o || {})); }
/* kịch bản: mảng phản hồi lần lượt; prompt có "SỬA LẠI BẢN THẢO" là lượt viết lại */
function scripted(replies, log) {
  let i = 0;
  sandbox.callWithRetry = async (args) => {
    const prompt = args.messages[args.messages.length - 1].content;
    log && log.push(prompt.startsWith("SỬA LẠI") ? "rewrite" : "review");
    return { text: replies[Math.min(i++, replies.length - 1)] };
  };
}

tg("Gate: PASS ngay lần đầu → APPROVED, không viết lại", async () => {
  const log = []; scripted([review()], log);
  const ch = { text: longText("gió", 300), versions: [] };
  const r = await T.runWorkerQualityGate(gateJob(), ch, 1);
  assert.strictEqual(r.approved, true); assert.strictEqual(ch.status, "APPROVED"); assert.deepStrictEqual(log, ["review"]);
});
tg("Gate: hard failure (retcon) → HARD_FAIL dù điểm 95", async () => {
  scripted([review({ retcon: true })]);
  const r = await T.qualityReviewWorker(gateJob(), { text: longText("a", 50) }, 1);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.review.verdict, "HARD_FAIL"); assert(r.review.hardFailures.length >= 1);
});
tg("Gate: vượt ngân sách sự kiện / nhân vật → HARD_FAIL", async () => {
  scripted([review({ mainEventCount: 9 })]);
  const r1 = await T.qualityReviewWorker(gateJob({ maxMainEvents: 3 }), { text: "x" }, 1);
  assert.strictEqual(r1.review.verdict, "HARD_FAIL");
  scripted([review({ namedCharacterCount: 12 })]);
  const r2 = await T.qualityReviewWorker(gateJob({ maxNamedCharacters: 4 }), { text: "x" }, 1);
  assert.strictEqual(r2.review.verdict, "HARD_FAIL");
});
tg("Gate: ngưỡng điểm 90/75 → 80 là SOFT_FAIL, 70 là HARD_FAIL, 90 là PASS", async () => {
  for (const [score, want] of [[90, "PASS"], [80, "SOFT_FAIL"], [70, "HARD_FAIL"]]) {
    scripted([review({ score })]);
    const r = await T.qualityReviewWorker(gateJob(), { text: longText("a", 150) }, 1);
    assert.strictEqual(r.review.verdict, want, `score ${score}`);
  }
});
tg("Gate (worker): kiểm tra cứng dùng chung — bản thảo quá ngắn → HARD_FAIL dù Auditor chấm 95", async () => {
  scripted([review({ score: 95 })]);
  const r = await T.qualityReviewWorker(gateJob(), { text: "quá ngắn" }, 1);
  assert.strictEqual(r.review.verdict, "HARD_FAIL"); assert(r.review.hardFailures.some(h => /đủ nội dung/.test(h)));
});
tg("Gate (worker): prompt Auditor có quy tắc + schema dùng chung và tên NV đã biết", async () => {
  const log = []; let seen = "";
  sandbox.callWithRetry = async (a) => { seen = a.messages[a.messages.length - 1].content; return { text: review() }; };
  const job = gateJob({ characters: [{ name: "Minh Khoa" }, { name: "Lan" }] });
  await T.qualityReviewWorker(job, { text: longText("Minh Khoa", 150) + " Minh Khoa gặp Lan." }, 1);
  assert(/QUALITY AUDITOR/.test(seen) && /SCHEMA:/.test(seen) && /QUY TẮC:/.test(seen) && /CHAPTER BRIEF/.test(seen));
  assert(/TÊN NHÂN VẬT ĐÃ BIẾT[^\n]*\n\nMinh Khoa, Lan|Minh Khoa, Lan/.test(seen), "thiếu danh sách tên đã biết");
});
tg("Gate: trượt → viết lại → đạt; bản gốc được lưu vào versions", async () => {
  const log = []; const orig = longText("cũ", 300), fixed = longText("mới", 300);
  scripted([review({ score: 60 }), fixed, review()], log);
  const ch = { text: orig, versions: [] };
  const r = await T.runWorkerQualityGate(gateJob(), ch, 1);
  assert.strictEqual(r.approved, true); assert.deepStrictEqual(log, ["review", "rewrite", "review"]);
  assert(ch.text.includes("mới") && !ch.text.includes("cũ"), "bản sửa phải thay bản nháp");
  assert.strictEqual(ch.versions.length, 1); assert(ch.versions[0].text.includes("cũ"), "bản gốc phải còn trong versions");
});
tg("Gate: bản sửa rỗng/ngắn bất thường bị TỪ CHỐI, giữ nguyên bản thảo", async () => {
  const orig = longText("gốc", 300);
  scripted([review({ score: 50 }), "Quá ngắn."]);
  const ch = { text: orig, versions: [] };
  const r = await T.runWorkerQualityGate(gateJob(), ch, 1);
  assert.strictEqual(r.approved, false); assert.strictEqual(ch.text, orig, "không được ghi đè bằng bản sửa ngắn");
  assert.strictEqual(ch.versions.length, 0);
  assert(ch.review.warnings.some(w => /từ chối/.test(w)));
});
tg("Gate: lỗi API khi viết lại không làm mất bản thảo", async () => {
  let i = 0; const orig = longText("gốc", 300);
  sandbox.callWithRetry = async (a) => { if (i++ === 0) return { text: review({ score: 40 }) }; throw new Error("503"); };
  const ch = { text: orig, versions: [] };
  const r = await T.runWorkerQualityGate(gateJob(), ch, 1);
  assert.strictEqual(r.approved, false); assert.strictEqual(ch.text, orig);
});
tg("Gate: hết số lần thử vẫn trượt → không approved, status REVISION_REQUIRED", async () => {
  const log = []; scripted([review({ score: 40 }), longText("x", 300)], log);
  const ch = { text: longText("a", 300), versions: [] };
  const r = await T.runWorkerQualityGate(gateJob({ qualityMaxAttempts: 2 }), ch, 1);
  assert.strictEqual(r.approved, false); assert.strictEqual(ch.status, "REVISION_REQUIRED");
  assert.strictEqual(log.filter(x => x === "review").length, 2);
});
tg("Gate: review trả rác → approved=false kèm lỗi, không ném exception", async () => {
  scripted(["xin lỗi tôi không thể"]);
  const r = await T.runWorkerQualityGate(gateJob(), { text: longText("a", 100), versions: [] }, 1);
  assert.strictEqual(r.approved, false); assert(r.error);
});
tg("Gate: tắt qualityGateEnabled → BYPASS, không gọi AI", async () => {
  let calls = 0; sandbox.callWithRetry = async () => { calls++; return { text: "" }; };
  const ch = { text: "x", versions: [] };
  const r = await T.runWorkerQualityGate(gateJob({ qualityGateEnabled: false }), ch, 1);
  assert.strictEqual(r.approved, true); assert.strictEqual(calls, 0); assert.strictEqual(ch.review.verdict, "BYPASS");
});

Promise.all(pending).then(() => {
console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
});
