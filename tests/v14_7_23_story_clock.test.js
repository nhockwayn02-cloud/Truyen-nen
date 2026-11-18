// V14.7.23: Story Clock đứng yên dù chương đã qua ngày.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={currentTimeMark,syncStoryClockFromStatus,timePrompt,autoTimeMark};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const mk = (o) => Object.assign({ storyClock: '15/1/2026, tối', statusState: { currentState: { time: 'Sáng 16/1/2026' } } }, o);
t('NGUYÊN NHÂN cũ: ô nhập tay chặn mốc tự trích — nay mặc định mốc tự trích thắng', () => {
  assert.strictEqual(F.currentTimeMark(mk({})), 'Sáng 16/1/2026'); assert.strictEqual(F.currentTimeMark(mk({ storyClockAuto: true })), 'Sáng 16/1/2026');
});
t('ghim tay (storyClockAuto=false) vẫn ưu tiên ô nhập tay', () => { assert.strictEqual(F.currentTimeMark(mk({ storyClockAuto: false })), '15/1/2026, tối'); });
t('không có mốc tự trích thì dùng ô nhập tay', () => { assert.strictEqual(F.currentTimeMark({ storyClock: 'Ngày 3', statusState: {} }), 'Ngày 3'); });
t('đồng bộ Story Clock theo Status: đổi khi khác, đứng yên khi trùng/ghim/không có mốc', () => {
  const a = mk({}); assert.ok(F.syncStoryClockFromStatus(a)); assert.strictEqual(a.storyClock, 'Sáng 16/1/2026'); assert.ok(!F.syncStoryClockFromStatus(a));
  const b = mk({ storyClockAuto: false }); assert.ok(!F.syncStoryClockFromStatus(b)); assert.strictEqual(b.storyClock, '15/1/2026, tối');
  const c = { storyClock: 'giữ', statusState: {} }; assert.ok(!F.syncStoryClockFromStatus(c)); assert.strictEqual(c.storyClock, 'giữ');
});
t('prompt thời gian dùng mốc mới, không còn mốc cũ', () => { const p = F.timePrompt(mk({})); assert.ok(p.includes('Sáng 16/1/2026') && !p.includes('15/1/2026, tối')); });
t('client nối checkbox, Lưu = ghim, đồng bộ sau mỗi chương', () => {
  const c = fs.readFileSync(path.join(__dirname, '../app/client.js'), 'utf8'), h = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(c.includes('syncStoryClockFromStatus(state)') && c.includes('state.storyClockAuto = false') && c.includes('storyClockAuto:true') && h.includes('id="storyClockAuto"'));
  assert.ok((c.match(/syncStoryClockFromStatus\(state\)/g) || []).length >= 3);
});
process.exit(bad ? 1 : 0);
