// V14.7.24: nhân vật xuất hiện nhiều chương (cảnh nội tâm/quan hệ) vẫn không được cập nhật — trường tâm lý/diễn biến bị cổng từ khóa loại.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={INTERPRETIVE_CHAR_FIELDS,fieldQuoteSupports,fieldEvidenceSupports};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const SRC = 'Linh cắn môi, mắt ươn ướt. "Em... em không muốn dừng lại," cô thì thầm, tay vẫn bấu chặt vào áo anh.';
const EV = 'Em... em không muốn dừng lại, cô thì thầm, tay vẫn bấu chặt vào áo anh.';
t('tâm lý trừu tượng bị cổng cũ loại, cổng mới nhận', () => {
  const v = 'Chống cự yếu dần, bắt đầu lệ thuộc vào Bùi Lạc và khao khát bị chiếm hữu';
  assert.ok(!F.fieldEvidenceSupports(v, EV, SRC, 0.35)); assert.ok(F.fieldQuoteSupports(v, EV, SRC));
});
t('danh sách gồm trường tâm lý/diễn biến; trường cụ thể không có', () => {
  ['personality', 'goals', 'weakness', 'fear', 'knowledge', 'chapterEvent', 'independentPlot', 'strength', 'mentalState', 'physicalState'].forEach(k => assert.ok(F.INTERPRETIVE_CHAR_FIELDS.includes(k), k));
  ['secret', 'age', 'gender', 'occupation', 'position', 'faction', 'height', 'measurements', 'appearance', 'currentLocation'].forEach(k => assert.ok(!F.INTERPRETIVE_CHAR_FIELDS.includes(k), k));
});
t('câu trích bịa vẫn bị loại', () => { assert.ok(!F.fieldQuoteSupports('lệ thuộc', 'Câu này không hề có trong chương hôm nay', SRC)); });
t('worker áp cổng câu trích cho tâm lý, bí mật, sự kiện chương', () => {
  const w = fs.readFileSync(path.join(__dirname, '../netlify/functions/write-chapter-background.js'), 'utf8');
  assert.ok(w.includes('INTERPRETIVE_CHAR_FIELDS.includes(field) ? fieldQuoteSupports(safeU[field], _e, source)') && w.includes('fieldEvidenceSupports(safeU.secret, se.secret || fe.secret') && w.includes('fieldQuoteSupports(safeU.chapterEvent,') && !w.includes('fieldEvidenceSupports(safeU.chapterEvent'));
});
process.exit(bad ? 1 : 0);
