// V14.7.26: thẻ nhân vật tạo ra rỗng dù Current Status mô tả đủ — giá trị cụ thể bị loại vì AI chỉ đưa MỘT câu trích chung.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={chapterCoverageSupports,fieldSupportedInChapter,fieldEvidenceSupports};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const SRC = 'Trần Minh Châu bước vào văn phòng, mái tóc đen dài mượt mà xõa ngang lưng. Cô khoảng hai mươi sáu tuổi, mặc chiếc váy lụa mỏng ngắn đến mức chỉ vừa che khuất phần hông. Bùi Lạc kéo cô lại gần, vùng da trắng ngần hiện những vệt đỏ.';
const GENERIC = 'Bùi Lạc kéo cô lại gần, vùng da trắng ngần hiện những vệt đỏ.';
t('NGUYÊN NHÂN: giá trị ngoại hình nằm ở câu khác, so với câu trích chung thì bị cổng cũ loại', () => {
  assert.ok(!F.fieldEvidenceSupports('mái tóc đen dài mượt xõa ngang lưng', GENERIC, SRC, 0.35));
});
t('cổng mới: giá trị có thật trong chương thì được nhận dù câu trích chung không chứa nó', () => {
  assert.ok(F.fieldSupportedInChapter('mái tóc đen dài mượt xõa ngang lưng', GENERIC, SRC, 0.35));
  assert.ok(F.fieldSupportedInChapter('váy lụa mỏng ngắn che khuất phần hông', GENERIC, SRC, 0.35));
});
t('giá trị bịa (từ khóa không có trong chương) vẫn bị loại', () => {
  assert.ok(!F.fieldSupportedInChapter('mắt xanh biếc, sẹo dài trên má trái, tay cầm kiếm bạc', GENERIC, SRC, 0.35));
});
t('con số bịa bị loại, con số có thật thì qua', () => {
  assert.ok(!F.chapterCoverageSupports('Châu 31 tuổi, tóc đen dài', SRC)); assert.ok(F.chapterCoverageSupports('mái tóc đen dài xõa ngang lưng', SRC));
});
t('worker dùng cổng mới cho trường cụ thể; bí mật vẫn cần bằng chứng riêng', () => {
  const w = fs.readFileSync(path.join(__dirname, '../netlify/functions/write-chapter-background.js'), 'utf8');
  assert.ok(w.includes('fieldSupportedInChapter(safeU[field], _ev, source, FIELD_T)') && w.includes('fieldSupportedInChapter(safeU[field], _e, source, FIELD_T)') && w.includes('fieldEvidenceSupports(safeU.secret, se.secret || fe.secret'));
});
process.exit(bad ? 1 : 0);
