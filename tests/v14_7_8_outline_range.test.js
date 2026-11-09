// V14.7.8: outline dạng chặng "Chương 2–3" phải tới được kế hoạch từng chương (trước đây bị bỏ/đọc nhầm).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f=outlineChapterLines;', ctx);
let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const txt = 'Chương 2–3\nBeat: Phá trinh ngay từ sớm, hắn gọi Linh Chi xuống tầng hầm.\n18+: Phá trinh trên xe.\nMóc kết: Hắn để lại trứng rung.\nChương 4-5\nBeat: Trứng rung điều khiển từ xa trong giờ làm.\nChương 6: một chương đơn lẻ rõ ràng ở đây\nCh7–8: Huấn luyện tại nhà Linh Chi bằng roi và trói.';
const m = ctx.f(txt, { from: 2, to: 8 });
t('mọi chương trong chặng đều có dòng outline', () => { [2, 3, 4, 5, 6, 7, 8].forEach(k => assert.ok(m[k], 'thiếu ch' + k)); });
t('mỗi chương nhận nội dung chặng kèm nhãn phần k/n', () => { assert.match(m[2], /phần 1\/2/); assert.match(m[3], /phần 2\/2/); assert.match(m[3], /Phá trinh trên xe/); assert.match(m[3], /Móc kết/); assert.match(m[5], /phần 2\/2/); });
t('tiêu đề chặng không bị đọc nhầm thành chương 2 với nội dung "3"', () => { assert.ok(!/^3\b/.test(m[2])); });
t('chương đơn lẻ và chặng ghi trên cùng một dòng vẫn đúng', () => { assert.match(m[6], /^một chương đơn lẻ/); assert.match(m[7], /Huấn luyện tại nhà/); assert.match(m[8], /phần 2\/2/); });
t('định dạng cũ "Ch12: ..." không đổi', () => { const o = ctx.f('Ch12: bước tiến của chương mười hai\n- cảnh phụ thêm', null); assert.equal(Object.keys(o).join(), '12'); assert.match(o[12], /cảnh phụ thêm/); });
process.exit(bad ? 1 : 0);
