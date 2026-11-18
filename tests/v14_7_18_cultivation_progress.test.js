// V14.7.18: tu luyện phải có tiến bộ rõ ràng, đo được.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={CULTIVATION_PROGRESS_CRAFT,cultivationSystemBlock,cultivationActive,buildChapterPlanPrompt};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
t('craft đòi mốc cụ thể, trước-sau, cái giá, nhịp và câu tường minh', () => {
  ['MỐC CỤ THỂ', 'TRƯỚC–SAU', 'CÁI GIÁ', 'NHỊP', 'GHI RÕ ĐỂ HỒ SƠ CẬP NHẬT', 'tiến độ tích lũy'].forEach(k => assert.ok(F.CULTIVATION_PROGRESS_CRAFT.includes(k), k));
});
t('khối canon tu luyện chứa luật tiến bộ; truyện khác thì không', () => {
  assert.ok(F.cultivationSystemBlock({ genre: 'Tu tiên' }).includes('TIẾN BỘ TU LUYỆN PHẢI RÕ RÀNG'));
  assert.strictEqual(F.cultivationSystemBlock({ genre: 'Đô thị' }), '');
});
t('cultivationActive nhận diện đúng', () => {
  assert.strictEqual(F.cultivationActive({ genre: 'Tu tiên' }), true); assert.strictEqual(F.cultivationActive({ genre: 'Đô thị' }), false); assert.strictEqual(F.cultivationActive({ genre: 'x', cultivationSystem: 'abc' }), true);
});
t('kế hoạch chương có khối tiến bộ chỉ khi bật cultivation', () => {
  const base = { chapterNumber: 3, context: 'c', recent: 'r', directive: 'd', mainCharName: 'A' };
  assert.match(F.buildChapterPlanPrompt({ ...base, cultivation: true }), /MỐC TIẾN BỘ CỤ THỂ/);
  assert.ok(!F.buildChapterPlanPrompt(base).includes('MỐC TIẾN BỘ CỤ THỂ'));
});
t('client và worker đã truyền cultivation vào kế hoạch', () => {
  assert.ok(/cultivation: cultivationActive\(state\)/.test(fs.readFileSync(path.join(__dirname, '../app/client.js'), 'utf8')));
  assert.ok(/cultivation: cultivationActive\(state\)/.test(fs.readFileSync(path.join(__dirname, '../netlify/functions/write-chapter-background.js'), 'utf8')));
});
process.exit(bad ? 1 : 0);
