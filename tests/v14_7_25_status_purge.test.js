// V14.7.25: xóa/gộp nhân vật phải dọn luôn thẻ + dòng của nhân vật đó trong Current Status.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={purgeCharacterFromStatus,mergeCharacterIntoState,statusCharacterLines,replaceStatusCharacterBlock};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const mkState = () => {
  const cards = [{ characterId: 'c1', name: 'Quỳnh Anh', changes: { clothing: 'bộ suit trắng' } }, { characterId: 'c2', name: 'Trần Minh Châu', changes: { clothing: 'váy lụa mỏng' } }];
  return { characters: [{ id: 'c1', name: 'Quỳnh Anh', relationships: [] }, { id: 'c2', name: 'Trần Minh Châu', aliases: ['Minh Châu'], relationships: [] }],
    mainCharProfile: { name: 'Bùi Lạc' }, statusState: { characterStates: cards }, currentStatus: 'Tình hình chung\n' + F.statusCharacterLines(cards) + '\n- Xung đột: không' };
};
t('xóa nhân vật: thẻ và dòng trong văn bản Current Status biến mất', () => {
  const st = mkState(); assert.ok(st.currentStatus.includes('Trần Minh Châu'));
  assert.strictEqual(F.purgeCharacterFromStatus(st, ['Trần Minh Châu', 'Minh Châu'], ['c2']), 1);
  assert.ok(!st.currentStatus.includes('Trần Minh Châu') && st.currentStatus.includes('Quỳnh Anh') && st.currentStatus.includes('Xung đột: không'));
  assert.strictEqual(st.statusState.characterStates.length, 1);
});
t('gộp nguồn vào đích đã có thẻ: bỏ thẻ nguồn; đích chưa có thẻ: thẻ chuyển sang đích', () => {
  const a = mkState(); const r = F.mergeCharacterIntoState(a, 'c2', 'c1'); assert.ok(r.ok);
  assert.strictEqual(a.statusState.characterStates.length, 1); assert.ok(!a.currentStatus.includes('Trần Minh Châu'));
  const b = mkState(); b.statusState.characterStates = [b.statusState.characterStates[1]]; b.currentStatus = F.statusCharacterLines(b.statusState.characterStates);
  assert.ok(F.mergeCharacterIntoState(b, 'c2', 'c1').ok); assert.strictEqual(b.statusState.characterStates[0].name, 'Quỳnh Anh'); assert.strictEqual(b.statusState.characterStates[0].characterId, 'c1'); assert.ok(b.currentStatus.includes('Quỳnh Anh: ') && !b.currentStatus.includes('Trần Minh Châu'));
});
t('không có thẻ Status hoặc không trùng thì không làm gì', () => {
  assert.strictEqual(F.purgeCharacterFromStatus({}, ['x'], []), 0); const st = mkState(); assert.strictEqual(F.purgeCharacterFromStatus(st, ['Người Lạ'], ['zz']), 0); assert.strictEqual(st.statusState.characterStates.length, 2);
});
t('client: xóa tay, xóa bản trùng, gộp đều gọi dọn Status; hoàn tác khôi phục', () => {
  const c = fs.readFileSync(path.join(__dirname, '../app/client.js'), 'utf8');
  assert.ok((c.match(/purgeCharacterFromStatus\(state,/g) || []).length >= 2); assert.ok(c.includes('statusCards: JSON.stringify') && c.includes('charMergeUndo.statusCards'));
});
process.exit(bad ? 1 : 0);
