// V14.5.1: Quality Gate chặn khi chương thiếu nhiều ý của Outline (đối chiếu từ khóa); thiếu ít chỉ cảnh báo.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(src + '\n;this.__t={outlineGateCheck,outlineBeatCoverage,evaluateReview};', ctx);
const T = ctx.__t; let pass = 0; const t = (n, f) => { f(); console.log('PASS ' + n); pass++; };
const CONTENT = ['Chương 6 — Theo dõi kho hàngSự kiện: Hà quan sát nhà kho Song Hành từ xa.', '•\tĐêm về, gọi Lan xuống tầng hầm B2.', '•\tBắt Lan ký biên bản giả, đứng yên giữa phòng.', '•\tBắt Lan đọc to câu cam kết trung thành.Kháng cự: Im lặng.Hậu quả: Bị buộc nghe theo.Móc kết: Hà đưa cô về.'].join('\n');
const st = (extra) => Object.assign({ outlineBeatGate: 'strict', chapters: new Array(5).fill({}), outlinePlans: [{ name: 'GĐ1', from: 6, to: 8, content: CONTENT }] }, extra || {});
const FULL = 'Hà đứng nhìn nhà kho Song Hành từ xa suốt buổi tối. Đêm về, Hà gọi Lan xuống tầng hầm B2. Hà bắt Lan ký biên bản giả rồi đứng yên giữa phòng. Hà bắt Lan đọc to câu cam kết trung thành. Lan im lặng, bị buộc nghe theo. Hà đưa cô về.';
const OFFTOPIC = 'Hà ngồi trong quán cà phê mở máy tính, đọc thư mục quỹ đen và gọi điện hỏi mật khẩu của tập tin mã hóa.';
const names = ['Hà', 'Lan'];
t('truyện làm đủ các ý Outline -> không báo gì', () => {
  const r = T.outlineGateCheck(st(), 6, FULL, names); assert.deepStrictEqual([r.hard.length, r.warn.length], [0, 0], JSON.stringify(r));
});
t('truyện lệch hẳn Outline -> LỖI NẶNG, nêu rõ các ý còn thiếu và cho phép duyệt thủ công', () => {
  const r = T.outlineGateCheck(st(), 6, OFFTOPIC, names);
  assert.strictEqual(r.hard.length, 1, JSON.stringify(r)); assert.ok(/chưa thực hiện đủ/.test(r.hard[0]) && /duyệt thủ công/.test(r.hard[0]) && /«/.test(r.hard[0]));
});
t('thiếu ít (dưới 40% số ý) -> chỉ cảnh báo, không phải lỗi nặng', () => {
  const nearly = 'Hà đứng nhìn nhà kho Song Hành từ xa. Đêm về, Hà gọi Lan xuống tầng hầm B2. Hà bắt Lan ký biên bản giả, đứng yên giữa phòng. Hà bắt Lan nói điều gì đó, Lan im lặng, bị buộc nghe theo. Hà đưa cô về.';
  const r = T.outlineGateCheck(st(), 6, nearly, names);
  assert.strictEqual(r.hard.length, 0, JSON.stringify(r)); assert.strictEqual(r.warn.length, 1, JSON.stringify(r));
  assert.ok(/chưa thấy 1\/5 ý/.test(r.warn[0]));
});
t('tắt bằng state.outlineBeatGate=false; không có Outline chương -> không báo; chương khác không bị ảnh hưởng', () => {
  assert.strictEqual(JSON.stringify(T.outlineGateCheck(st({ outlineBeatGate: false }), 6, OFFTOPIC, names)), '{"hard":[],"warn":[]}');
  assert.strictEqual(JSON.stringify(T.outlineGateCheck({ chapters: [], outlinePlans: [] }, 6, OFFTOPIC, names)), '{"hard":[],"warn":[]}');
  assert.strictEqual(T.outlineGateCheck(st(), 12, OFFTOPIC, names).hard.length, 0);
});
t('V14.5.9: mặc định (không strict) thiếu ý Outline chỉ CẢNH BÁO; AI Auditor báo thiếu sự kiện bắt buộc cũng bị hạ xuống cảnh báo', () => {
  const og = T.outlineGateCheck(st({ outlineBeatGate: true }), 6, OFFTOPIC, names);
  assert.strictEqual(og.hard.length, 0); assert.strictEqual(og.warn.length, 1);
  const rv = T.evaluateReview({ score: 95, dimensions: {}, hardFailures: ['Thiếu sự kiện bắt buộc [R2]: Lan ký biên bản'] }, {});
  assert.strictEqual(rv.verdict, 'PASS'); assert.strictEqual(rv.hardFailures.length, 0); assert.ok(rv.warnings.some(x => /Thiếu sự kiện bắt buộc/.test(x)));
  const rs = T.evaluateReview({ score: 95, dimensions: {}, hardFailures: ['Thiếu sự kiện bắt buộc [R2]'] }, { strictBeats: true });
  assert.strictEqual(rs.verdict, 'HARD_FAIL');
});
t('đi qua evaluateReview: lỗi nặng của Outline làm verdict HARD_FAIL dù điểm cao; cảnh báo thì không', () => {
  const og = T.outlineGateCheck(st(), 6, OFFTOPIC, names);
  const rv = T.evaluateReview({ score: 95, dimensions: {} }, { extraHard: og.hard, extraWarnings: og.warn });
  assert.strictEqual(rv.verdict, 'HARD_FAIL'); assert.ok(rv.hardFailures.some(x => /Outline chương 6/.test(x)));
  const ok = T.evaluateReview({ score: 95, dimensions: {} }, { extraHard: [], extraWarnings: ['Outline chương 6 ... cảnh báo'] });
  assert.strictEqual(ok.verdict, 'PASS'); assert.ok(ok.warnings.some(x => /Outline chương 6/.test(x)));
});
t('đã gắn vào client + worker và có công tắc giao diện', () => {
  const html = require('./_read_index.js')(), wk = fs.readFileSync(path.join(__dirname, '../netlify/functions/write-chapter-background.js'), 'utf8');
  assert.ok(/outlineGateCheck\(state,chapterNumber,chapter\.text,gateKnownNames\(state\)\)/.test(html) && /outlineBeatGateToggle/.test(html));
  assert.ok(/outlineGateCheck\(job\.storyState, n, chapter\.text, gateKnownNames\(job\.storyState\)\)/.test(wk));
});
console.log('OK ' + pass + ' test');
