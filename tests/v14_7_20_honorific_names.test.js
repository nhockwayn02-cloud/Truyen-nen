// V14.7.20: "chị A", "anh B", tên gọi tắt phải nhận ra đúng nhân vật có sẵn, không tạo nhân vật mới / không đoán khi mơ hồ.
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={resolveCharacterTarget,stripNameHonorific,learnCharacterAlias};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const st = { mainCharProfile: { name: 'Bùi Lạc', aliases: [] }, characters: [{ name: 'Trần Quỳnh Anh', aliases: [] }, { name: 'Lê Hùng', aliases: [] }, { name: 'Phạm Hoa', aliases: [] }, { name: 'Nguyễn Hoa', aliases: [] }] };
const r = n => F.resolveCharacterTarget(st, n);
t('danh xưng + tên → đúng nhân vật có sẵn', () => { assert.strictEqual(r('chị Hùng').character.name, 'Lê Hùng'); assert.strictEqual(r('anh Hùng').via, 'honorific'); assert.strictEqual(r('chị Quỳnh Anh').character.name, 'Trần Quỳnh Anh'); });
t('tên gọi tắt duy nhất → đúng người; tên đầy đủ vẫn khớp nguyên', () => { assert.strictEqual(r('Quỳnh Anh').character.name, 'Trần Quỳnh Anh'); assert.strictEqual(r('Lê Hùng').via, undefined); });
t('nhân vật chính cũng được nhận qua danh xưng', () => { assert.strictEqual(r('anh Lạc').kind, 'main'); });
t('trùng tên gọi giữa hai người → mơ hồ, không đoán, không tạo mới', () => { const x = r('chị Hoa'); assert.strictEqual(x.kind, 'ambiguous'); assert.strictEqual(JSON.stringify(Array.from(x.names).sort()), JSON.stringify(['Nguyễn Hoa', 'Phạm Hoa'])); });
t('chỉ danh xưng/đại từ → bỏ qua (none), không tạo nhân vật "Chị"', () => { assert.strictEqual(r('chị').kind, 'none'); assert.strictEqual(r('anh ấy').kind, 'none'); assert.strictEqual(r('cô ta').kind, 'none'); });
t('người thật sự mới vẫn là new', () => { assert.strictEqual(r('cô Mai').kind, 'new'); assert.strictEqual(r('Trương Vĩ').kind, 'new'); });
t('học bí danh "chị Hùng" nhưng không học danh xưng trơn', () => { const c = st.characters[1]; assert.ok(F.learnCharacterAlias(c, 'chị Hùng')); assert.ok(!F.learnCharacterAlias(c, 'chị Hùng')); assert.ok(!F.learnCharacterAlias(c, 'chị')); assert.strictEqual(r('chị Hùng').via, 'alias'); });
t('worker và client dùng cùng bộ nhận diện + prompt dặn tên gọi', () => {
  const w = fs.readFileSync(path.join(__dirname, '../netlify/functions/write-chapter-background.js'), 'utf8'), c = fs.readFileSync(path.join(__dirname, '../app/client.js'), 'utf8');
  assert.ok(w.includes('_rtN.kind === "ambiguous"') && w.includes('TÊN GỌI:') && w.includes('aliases:(Array.isArray(c.aliases)')); assert.ok(c.includes('rt.kind === "ambiguous"') && c.includes('TÊN GỌI:'));
});
process.exit(bad ? 1 : 0);
