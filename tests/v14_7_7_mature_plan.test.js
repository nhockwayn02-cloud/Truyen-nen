// V14.7.7: kế hoạch chương phải lên lịch cảnh nóng theo Trọng tâm trưởng thành (truyện PRIMARY không được 0 cảnh 18+ vì brief không nhắc).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'shared/core.js'), 'utf8'), client = fs.readFileSync(path.join(root, 'app/client.js'), 'utf8'), worker = fs.readFileSync(path.join(root, 'netlify/functions/write-chapter-background.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(core + '\n;this.__t={buildChapterPlanPrompt};', ctx);
const T = ctx.__t; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const base = { chapterNumber: 3, context: 'c', recent: 'r', directive: 'Bùi Lạc điều tra hồ sơ rồi rời đi', mainCharName: 'Bùi Lạc' };
t('PRIMARY: bắt buộc có beat "cảnh nóng" dù brief không nhắc, dưới dạng [S] không làm lệch brief', () => {
  const p = T.buildChapterPlanPrompt({ ...base, mature: true, matureFocus: 'primary' });
  assert.match(p, /LỊCH CẢNH NÓNG/); assert.match(p, /PHẢI có ít nhất MỘT beat là CẢNH NÓNG/); assert.match(p, /\[S\]/); assert.match(p, /từ 18 tuổi/);
});
t('SECONDARY: chỉ gợi ý; nhưng sau ≥3 chương không có cảnh nóng thì bắt buộc', () => {
  assert.match(T.buildChapterPlanPrompt({ ...base, mature: true, matureFocus: 'secondary' }), /Nên có một beat CẢNH NÓNG/);
  assert.match(T.buildChapterPlanPrompt({ ...base, mature: true, matureFocus: 'secondary', heatFreeStreak: 3 }), /PHẢI có ít nhất MỘT beat là CẢNH NÓNG/);
});
t('tắt 18+ hoặc focus none: không có lịch cảnh nóng', () => {
  assert.ok(!/LỊCH CẢNH NÓNG/.test(T.buildChapterPlanPrompt({ ...base, mature: false, matureFocus: 'primary' })));
  assert.ok(!/LỊCH CẢNH NÓNG/.test(T.buildChapterPlanPrompt({ ...base, mature: true, matureFocus: 'none' })));
});
t('client và worker truyền mature/matureFocus/heatFreeStreak vào kế hoạch', () => {
  assert.match(client, /matureFocus: state\.chapterMatureFocus, heatFreeStreak: heatFreeStreakBefore/); assert.match(worker, /matureFocus: state\.chapterMatureFocus/); assert.match(worker, /heatFreeStreak/);
});
process.exit(bad ? 1 : 0);
