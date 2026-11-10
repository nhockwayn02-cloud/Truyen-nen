// V14.7.10: Character Database phải phản ánh trạng thái động từ chương (currentState) và không làm rơi chi tiết khi hồ sơ gốc đang khóa (newDetails).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'shared/core.js'), 'utf8'), client = fs.readFileSync(path.join(root, 'app/client.js'), 'utf8'), worker = fs.readFileSync(path.join(root, 'netlify/functions/write-chapter-background.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={characterStateLine,divertLockedDetail,acceptStatusCards};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
t('characterStateLine gom trạng thái động, bỏ trường trống', () => {
  const l = F.characterStateLine({ clothing: 'váy bút chì rách tất', marks: 'vết đỏ trên mông', items: 'trứng rung', age: '27', emotion: '' });
  assert.match(l, /trang phục hiện tại: váy bút chì rách tất/); assert.match(l, /dấu vết trên cơ thể: vết đỏ/); assert.match(l, /trứng rung/); assert.ok(!/27/.test(l));
});
t('hồ sơ gốc khóa: chi tiết mới đi vào newDetails, không ghi đè, không lặp', () => {
  const c = { name: 'Linh Chi', appearance: 'cao, tóc dài' };
  assert.equal(F.divertLockedDetail(c, 'appearance', 'xăm hình bướm sau gáy'), true);
  assert.equal(c.appearance, 'cao, tóc dài'); assert.match(c.newDetails, /Ngoại hình: xăm hình bướm/);
  assert.equal(F.divertLockedDetail(c, 'appearance', 'xăm hình bướm sau gáy'), false);
  assert.equal(F.divertLockedDetail(c, 'appearance', 'cao, tóc dài'), false);
  assert.equal(F.divertLockedDetail(c, 'age', '30'), false);
});
t('acceptStatusCards có bằng chứng -> ghi currentState vào nhân vật; không bằng chứng -> không ghi', () => {
  const text = 'Linh Chi mặc chiếc váy bút chì rách tất, run rẩy bước vào phòng họp.';
  const st = { statusState: { characterStates: [] } }, ch = { id: 'c1', name: 'Linh Chi' };
  F.acceptStatusCards(st, [{ characterId: 'c1', name: 'Linh Chi', card: { clothing: 'váy bút chì rách tất' }, changeEvidence: { clothing: 'mặc chiếc váy bút chì rách tất' } }], text, [ch]);
  assert.match(ch.currentState || '', /váy bút chì rách tất/);
  const ch2 = { id: 'c2', name: 'B' };
  F.acceptStatusCards({ statusState: { characterStates: [] } }, [{ characterId: 'c2', name: 'B', card: { clothing: 'áo choàng vàng' }, changeEvidence: { clothing: 'bịa đặt không có' } }], text, [ch2]);
  assert.ok(!ch2.currentState);
});
t('client và worker dùng divertLockedDetail; UI + schema có trường mới', () => {
  assert.match(client, /divertLockedDetail\(c, key, update\[key\]\)/); assert.match(worker, /divertLockedDetail\(c, k, u\[k\]\)/);
  assert.match(client, /\["currentState","Trạng thái hiện tại/); assert.match(client, /\["newDetails","Chi tiết mới ghi nhận/); assert.match(client, /currentState:"", currentStateChapter:null, newDetails:""/);
});
process.exit(bad ? 1 : 0);
