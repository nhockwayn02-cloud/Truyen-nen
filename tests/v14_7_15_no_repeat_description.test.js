// V14.7.15: ngoại hình đã tả thì không tả lại ("cao 185cm" lặp mỗi scene/chương).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const core = fs.readFileSync(path.join(__dirname, '../shared/core.js'), 'utf8');
const ctx = { console, Date, Math, JSON }; vm.createContext(ctx); vm.runInContext(core + '\n;this.f={sceneProfileWithAnchor,characterIntroduced,SCENE_APPEARANCE_ANCHOR,BODY_PROSE_CRAFT,appearanceAnchorPrompt};', ctx);
const F = ctx.f; let bad = 0; const t = (n, f) => { try { f(); console.log('PASS ' + n); } catch (e) { bad++; console.error('FAIL ' + n + ': ' + e.message); } };
const mk = (chs) => ({ mature: false, mainCharProfile: { name: 'Bùi Lạc', age: '28', height: '185cm', bodyType: 'gầy chắc' }, characters: [{ name: 'Quỳnh Anh', age: '27', height: '1m68', measurements: '90-62-92' }, { name: 'Hoàng Yến Nhi', age: '35', height: '1m70' }], chapters: chs });
t('nhân vật xuất hiện trong chương gần đây -> nhãn ĐÃ GIỚI THIỆU; chưa xuất hiện -> CHƯA GIỚI THIỆU', () => {
  const st = mk([{ text: 'Bùi Lạc nhìn Quỳnh Anh bước vào phòng.' }]);
  const p = F.sceneProfileWithAnchor(st, { characters: ['Bùi Lạc', 'Quỳnh Anh', 'Hoàng Yến Nhi'] }, []);
  assert.match(p, /Bùi Lạc \(NVC\) \[ĐÃ GIỚI THIỆU/); assert.match(p, /Quỳnh Anh \[ĐÃ GIỚI THIỆU/); assert.match(p, /Hoàng Yến Nhi \[CHƯA GIỚI THIỆU/);
});
t('chỉ nhìn 4 chương gần nhất: nhân vật vắng lâu coi là chưa giới thiệu', () => {
  const old = [{ text: 'Quỳnh Anh đến.' }, { text: 'x' }, { text: 'y' }, { text: 'z' }, { text: 'w' }];
  assert.equal(F.characterIntroduced(mk(old), { name: 'Quỳnh Anh' }), false); assert.equal(F.characterIntroduced(mk([{ text: 'Quỳnh Anh đến.' }]), { name: 'Quỳnh Anh' }), true);
});
t('neo ngoại hình: chỉ lần đầu trong truyện, chống lặp, tối đa 1–2 chi tiết mới', () => {
  const a = F.SCENE_APPEARANCE_ANCHOR; assert.match(a, /CHỈ ở lần đầu tiên nhân vật xuất hiện trong truyện/); assert.match(a, /CHỐNG LẶP/); assert.match(a, /tối đa 1–2 chi tiết thân thể MỚI/);
  assert.ok(!/lần đầu trong chương, hoặc khi cảnh tả/.test(a));
});
t('văn chương thân thể và đường viết thường cũng chống lặp', () => { assert.match(F.BODY_PROSE_CRAFT, /Chỉ lần ĐẦU/); assert.match(F.appearanceAnchorPrompt({ mature: false }, false), /CHỐNG LẶP/); });
process.exit(bad ? 1 : 0);
