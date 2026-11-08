// V14.7.6 Cast Planner: đề xuất dàn nhân vật mới, chỉ người trưởng thành, không trùng, tự nạp bản nháp.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'shared/core.js'), 'utf8'), client = fs.readFileSync(path.join(root, 'app/client.js'), 'utf8'), html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx);
vm.runInContext(core + '\n;this.__t={buildCastPlannerPrompt,normalizeCastPlannerCards};', ctx);
const T = ctx.__t; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const st = { genre: 'đô thị', mainPlot: 'Nữ chủ nợ nần', mature: true, mainCharProfile: { name: 'Lan', age: '27' }, characters: [{ name: 'Thanh Hà' }] };
t('prompt có bối cảnh, danh sách nhân vật đã có, ràng buộc ≥18 và đủ trường thẻ', () => {
  const p = T.buildCastPlannerPrompt(st, { count: 6 });
  assert.match(p, /Nữ chủ nợ nần/); assert.match(p, /Lan, Thanh Hà/); assert.match(p, /từ 18 trở lên/);
  ['measurements', 'addressTerms', 'secret', 'desire', 'relationship'].forEach(k => assert.ok(p.includes(k), k));
});
t('chỉ nhận người ≥18; loại dưới 18, thiếu tuổi, trùng tên (kể cả nhân vật chính, khác hoa/thường/dấu)', () => {
  const r = T.normalizeCastPlannerCards([
    { name: 'Minh Châu', age: 29, relationship: 'chị họ', desire: 'tiền', secret: 'nợ', height: '1m68', measurements: '90-62-92', speech: 'chậm rãi', addressTerms: 'gọi Lan là em' },
    { name: 'Bé Mai', age: 16 }, { name: 'Vô Danh' }, { name: 'thanh hà', age: 30 }, { name: 'LAN', age: 30 }, { name: 'Kiều', age: '17 tuổi' }, { name: 'Quang', age: '18 tuổi' }
  ], st);
  assert.deepEqual(r.accepted.map(c => c.name), ['Minh Châu', 'Quang']); assert.equal(r.rejected.length, 5);
  const c = r.accepted[0]; assert.equal(c.relevanceToMC, 'chị họ'); assert.equal(c.goals, 'tiền'); assert.equal(c.measurements, '90-62-92'); assert.match(c.speech, /chậm rãi \| Xưng hô: gọi Lan là em/); assert.equal(c.locked, false);
});
t('trùng tên trong chính lô đề xuất chỉ nhận một', () => { assert.equal(T.normalizeCastPlannerCards([{ name: 'A', age: 20 }, { name: 'a', age: 21 }], {}).accepted.length, 1); });
t('đầu vào rác không làm vỡ', () => { assert.equal(T.normalizeCastPlannerCards(null, st).accepted.length, 0); assert.equal(T.normalizeCastPlannerCards([null, 5, {}], st).accepted.length, 0); });
t('giao diện có nút và client nạp bản nháp (locked=false), đã đồng bộ core', () => {
  assert.match(html, /id="castPlannerBtn"/); assert.match(client, /function runCastPlanner/); assert.match(client, /function normalizeCastPlannerCards/); assert.match(client, /castPlannerBtn[\s\S]{0,200}runCastPlanner/);
});
process.exit(bad ? 1 : 0);
