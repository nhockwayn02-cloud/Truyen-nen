// V14.7.9: dàn nhân vật mỏng -> tự nạp Cast Planner; kế hoạch chương luân phiên đưa nhân vật đã khai báo vào truyện.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'shared/core.js'), 'utf8'), client = fs.readFileSync(path.join(root, 'app/client.js'), 'utf8'), worker = fs.readFileSync(path.join(root, 'netlify/functions/write-chapter-background.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={castIsThin,castPoolForPlan,buildChapterPlanPrompt,normalizeStoryControl};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const mk = (chars) => ({ mainCharProfile: { name: 'Bùi Lạc' }, characters: chars });
t('mỏng khi < 3 người ngoài NVC (NVC và người đã chết không tính)', () => {
  assert.equal(F.castIsThin(mk([{ name: 'Bùi Lạc' }, { name: 'Linh Chi' }])), true);
  assert.equal(F.castIsThin(mk([{ name: 'A' }, { name: 'B' }, { name: 'C', dead: true }])), true);
  assert.equal(F.castIsThin(mk([{ name: 'A' }, { name: 'B' }, { name: 'C' }])), false);
});
t('pool: chỉ người chưa/lâu chưa xuất hiện, bỏ NVC', () => {
  const st = mk([{ name: 'Bùi Lạc' }, { name: 'Linh Chi', lastAppearance: 4 }, { name: 'Minh Châu', role: 'chị họ' }, { name: 'Quang', lastAppearance: 1 }]);
  assert.deepEqual(F.castPoolForPlan(st, 6).map(c => c.name), ['Minh Châu', 'Quang']);
});
t('prompt kế hoạch có khối nhân vật phụ khi có pool, không có khi rỗng', () => {
  const base = { chapterNumber: 6, context: 'c', recent: 'r', directive: 'd', mainCharName: 'Bùi Lạc' };
  const p = F.buildChapterPlanPrompt({ ...base, castPool: [{ name: 'Minh Châu', role: 'chị họ' }] });
  assert.match(p, /Minh Châu \(chị họ\)/); assert.match(p, /ÍT NHẤT MỘT người/);
  assert.ok(!/CHƯA\/LÂU CHƯA XUẤT HIỆN/.test(F.buildChapterPlanPrompt(base)));
});
t('storyControl giữ cờ castAutoPlanned', () => { assert.equal(F.normalizeStoryControl({ storyControl: { castAutoPlanned: true } }).castAutoPlanned, true); assert.equal(F.normalizeStoryControl({}).castAutoPlanned, false); });
t('client gọi ensureCastPlanned ở cả viết thường và viết nền; worker truyền castPool', () => {
  assert.match(client, /if\(!isRegen\) await ensureCastPlanned/); assert.match(client, /await ensureCastPlanned\(state\.chapters\.length \+ 1\)/); assert.match(client, /castPool: castPoolForPlan\(state, chapterNumber\)/); assert.match(worker, /castPool: castPoolForPlan/);
});
process.exit(bad ? 1 : 0);
